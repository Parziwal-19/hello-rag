import { NextApiRequest, NextApiResponse } from "next";
import { Pinecone } from "@pinecone-database/pinecone";
import { Crawler, Page } from "../../crawler";
import { Document } from "langchain/document";

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import Bottleneck from "bottleneck";
import { uuid } from "uuidv4";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { summarizeLongDocument } from "./summarizer";
import { OpenAIEmbeddings } from "@langchain/openai";
import { chunk, flattenDeep, isEmpty } from "lodash";
import { date } from "serializr";
import fs from "fs";

const MAX_CHUNK_SIZE = 100;

const limiter = new Bottleneck({
  minTime: 25,
});

const USE_OPEN_AI_EMBEDDING = process.env.USE_OPEN_AI_EMBEDDING === "true";

const namespace = process.env.NAMESPACE;
const CHUNK_SIZE = 100;
const embedder = Boolean(USE_OPEN_AI_EMBEDDING)
  ? new OpenAIEmbeddings({
      modelName: process.env.OPEN_AI_EMBEDDING_MODEL,
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
  : new HuggingFaceTransformersEmbeddings({
      modelName: "Xenova/bge-m3",
    });

let pinecone: Pinecone | null = null;

type Response = {
  message: string;
};

// //Embed the documents
const getEmbeddingForDoc = async (
  chunk: Document,
  index: number,
  docId,
  fileName
) => {
  const chunkId = chunk.metadata.judgementId + "#chunk" + index;
  console.log("embedding chunk" + chunkId);
  //TODO: Should this be embedDocument and not embedQuery
  const embedding = await embedder.embedQuery(chunk.pageContent);
  const vector = {
    id: chunkId,
    values: embedding,
    metadata: {
      chunk: chunk.pageContent,
      url: chunk.metadata.url as string,
      court: chunk.metadata.court as string,
      title: chunk.metadata.title as string,
      author: chunk.metadata.author as string,
      bench: chunk.metadata.bench as string,
      judgementId: chunk.metadata.judgementId,
    },
  };
  console.log("finished embeddings chunk" + chunkId);

  fs.appendFileSync(fileName, JSON.stringify({ docId, vector }) + ",");
  return vector;
};

const splitDoc = (doc) => {
  console.log("splitting doc" + doc.id);
  //TODO: @sid explire contextal chunk headers below
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 150,
  });

  const pageContent = doc.text;

  return splitter.splitDocuments([
    new Document({
      pageContent,
      metadata: {
        url: doc.url,
        title: doc.title,
        court: doc.court,
        citations: doc.citations,
        author: doc.author,
        bench: doc.bench,
        judgementId: doc.id,
      },
    }),
  ]);
};

const splitAndEmbedDoc = async (doc, rateLimitedGetEmbedding, fileName) => {
  console.log("getting Embedding for doc" + doc.id);
  const chunksForDoc = await splitDoc(doc);
  if (chunksForDoc.length > MAX_CHUNK_SIZE) {
    console.log("too many chunks for doc" + doc.id);
    fs.appendFileSync(`./largeDocIds+run2k.txt`, doc.id + "\n");
    return [];
  }
  return chunksForDoc.map((chunk, index) =>
    rateLimitedGetEmbedding(chunk, index, doc.id, fileName)
  );
  // why not write the output of this call to a file
};

const splitAndEmbedDocs = async (docs, rateLimitedGetEmbedding, fileName) => {
  const embeddingPromises = docs.map((doc) =>
    splitAndEmbedDoc(doc, rateLimitedGetEmbedding, fileName)
  );

  const embeddings = await Promise.all(embeddingPromises);
  return embeddings;
};

const upsertVectors = async (chunks, Pinecone) => {
  const vectorChunks = chunk(chunks, CHUNK_SIZE);
  const pineconeIndexName = process.env.PINECONE_INDEX_NAME!;
  console.log(chunks.length);

  try {
    const index = pinecone && pinecone.Index(pineconeIndexName);

    await Promise.all(
      vectorChunks.map(async (chunk) => {
        await index!.upsert(chunk);
      })
    );
  } catch (e) {
    console.log(e);
  }
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
    // const fs = require('fs');
    const ids = JSON.parse(fs.readFileSync("idsToProcess.json", "utf8"));
    // const ids = typeof arrayID === "string" ? JSON.parse(arrayID) : arrayID;
    console.log(ids);
    const crawlLimit = parseInt(limit as string) || 100;

    const shouldSummarize = summmarize === "true";

    pinecone = await new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const crawler = new Crawler(ids, crawlLimit, 200);
    const pages = (await crawler.start()) as Page[];

    const rateLimitedGetEmbedding = limiter.wrap(getEmbeddingForDoc);

    const embeddingsForDocuments = await splitAndEmbedDocs(
      pages,
      rateLimitedGetEmbedding,
      `embeddingsAppended${new Date().toISOString()}.json`
    );
    console.log(flattenDeep(embeddingsForDocuments));
    var vectorEmbeddings = await Promise.all(
      flattenDeep(embeddingsForDocuments)
    );
    vectorEmbeddings = vectorEmbeddings.filter((v) => !isEmpty(v));
    console.log("Done Embeddings: " + vectorEmbeddings.length);

    // fs.writeFileSync(
    //   `embedding${new Date().toISOString()}.json`,
    //   JSON.stringify(vectorEmbeddings)
    // );

    await upsertVectors(vectorEmbeddings, pinecone);
    res.status(200).json({ message: "Done" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: `Error ${JSON.stringify(e)}` });
  }
}
