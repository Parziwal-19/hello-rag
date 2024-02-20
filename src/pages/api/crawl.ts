import { NextApiRequest, NextApiResponse } from "next";
import { Pinecone, Vector } from "@pinecone-database/pinecone";
import { Crawler, Page } from "../../crawler";
import { Document } from "langchain/document";

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import Bottleneck from "bottleneck";
import { uuid } from "uuidv4";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { summarizeLongDocument } from "./summarizer";
import { OpenAIEmbeddings } from "@langchain/openai";

const limiter = new Bottleneck({
  minTime: 50,
});
const USE_OPEN_AI_EMBEDDING = process.env.USE_OPEN_AI_EMBEDDING;

const namespace = process.env.NAMESPACE;

const embedder = USE_OPEN_AI_EMBEDDING
  ? new OpenAIEmbeddings({
      modelName: "text-embedding-ada-002",
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
  : new HuggingFaceTransformersEmbeddings({
      modelName: "Xenova/bge-m3",
    });

let pinecone: Pinecone | null = null;

type Response = {
  message: string;
};

// The TextEncoder instance enc is created and its encode() method is called on the input string.
// The resulting Uint8Array is then sliced, and the TextDecoder instance decodes the sliced array in a single line of code.
const truncateStringByBytes = (str: string, bytes: number) => {
  const enc = new TextEncoder();
  return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
};

const sliceIntoChunks = (arr: Vector[], chunkSize: number) => {
  return Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) =>
    arr.slice(i * chunkSize, (i + 1) * chunkSize)
  );
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (!process.env.PINECONE_INDEX_NAME) {
      res.status(500).json({ message: "PINECONE_INDEX_NAME not set" });
      return;
    }

    const { query } = req;
    const { arrayID, limit, indexName, summmarize } = query;
    const ids = typeof arrayID === "string" ? JSON.parse(arrayID) : arrayID;
    console.log(ids);
    const crawlLimit = parseInt(limit as string) || 100;
    const pineconeIndexName =
      (indexName as string) || process.env.PINECONE_INDEX_NAME!;
    const shouldSummarize = summmarize === "true";

    pinecone = await new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const crawler = new Crawler(ids, crawlLimit, 200);
    const pages = (await crawler.start()) as Page[];
    console.log({ pages });
    const documents = await Promise.all(
      pages.map(async (row) => {
        //TODO: @sid explire contextal chunk headers below
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 500,
          chunkOverlap: 150,
        });

        // const pageContent = shouldSummarize
        //   ? await summarizeLongDocument({ document: row.text })
        //   : row.text;
        console.log(row.text);
        const pageContent = row.text;

        const docs = splitter.splitDocuments([
          new Document({
            pageContent,
            metadata: {
              url: row.url,
              title: row.title,
              court: row.court,
              citations: row.citations,
              author: row.author,
              bench: row.bench,
              judgementId: row.id,
            },
          }),
        ]);
        return docs;
      })
    );
    console.log(JSON.stringify(documents));
    const index = pinecone && pinecone.Index(pineconeIndexName);

    let counter = 0;

    // //Embed the documents
    const getEmbedding = async (doc: Document) => {
      console.log("gettttting embedding...");
      //TODO: Should this be embedDocument and not embedQuery
      const embedding = await embedder.embedQuery(doc.pageContent);
      console.log(doc.pageContent);
      console.log("got embedding", embedding.length);
      process.stdout.write(
        `${Math.floor((counter / documents.flat().length) * 100)}%\r`
      );
      counter = counter + 1;
      return {
        id: doc.metadata.judgementId + "#chunk" + counter,
        values: embedding,
        metadata: {
          chunk: doc.pageContent,
          url: doc.metadata.url as string,
          court: doc.metadata.court as string,
          title: doc.metadata.title as string,
          author: doc.metadata.author as string,
          bench: doc.metadata.bench as string,
          judgementId: doc.metadata.judgementId,
        },
      } as Vector;
    };
    const rateLimitedGetEmbedding = limiter.wrap(getEmbedding);
    process.stdout.write("100%\r");
    console.log("done embedding");

    let vectors = [] as Vector[];

    try {
      vectors = (await Promise.all(
        documents.flat().map((doc) => rateLimitedGetEmbedding(doc))
      )) as unknown as Vector[];
      const chunks = sliceIntoChunks(vectors, 10);
      console.log(chunks.length);

      try {
        await Promise.all(
          chunks.map(async (chunk) => {
            await index!.namespace("openAI").upsert(chunk);
          })
        );

        res.status(200).json({ message: "Done" });
      } catch (e) {
        console.log(e);
        res.status(500).json({ message: `Error ${JSON.stringify(e)}` });
      }
    } catch (e) {
      console.log(e);
    }
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: `Error ${JSON.stringify(e)}` });
  }
}
