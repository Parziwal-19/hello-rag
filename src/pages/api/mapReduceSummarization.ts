import {
  collapseDocs,
  splitListOfDocs,
} from "langchain/chains/combine_documents/reduce";
import { OpenAI, ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { formatDocument } from "langchain/schema/prompt_template";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { BaseCallbackConfig } from "@langchain/core/callbacks/manager";
import { Document } from "@langchain/core/documents";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { templates } from "./templates";

// Initialize the OpenAI model
const chatLlm =
  process.env.USE_OPEN_AI === "true"
    ? new OpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-3.5-turbo-0125",
      })
    : new OpenAI({
        openAIApiKey: "ahsbdjh",
        configuration: {
          baseURL: "http://localhost:1234/v1",
        },
        // modelName: "meta-llama/Llama-2-70b-chat-hf",
      });

// const model = new ChatOpenAI({});
// Define prompt templates for document formatting, summarizing, collapsing, and combining
const documentPrompt = PromptTemplate.fromTemplate("{pageContent}");
const summarizePrompt = PromptTemplate.fromTemplate(
  templates.summarizerTemplate
);
const collapsePrompt = PromptTemplate.fromTemplate(
  "Collapse this content:\n\n{context}"
);
const combinePrompt = PromptTemplate.fromTemplate(
  "Combine these summaries:\n\n{context}"
);

// Wrap the `formatDocument` util so it can format a list of documents
const formatDocs = async (documents: Document[]): Promise<string> => {
  const formattedDocs = await Promise.all(
    documents.map((doc) => formatDocument(doc, documentPrompt))
  );
  return formattedDocs.join("\n\n");
};

// Define a function to get the number of tokens in a list of documents
const getNumTokens = async (documents: Document[]): Promise<number> =>
  chatLlm.getNumTokens(await formatDocs(documents));

// Initialize the output parser
const outputParser = new StringOutputParser();

// Define the map chain to format, summarize, and parse the document
const mapChain = RunnableSequence.from([
  { context: async (i: Document) => formatDocument(i, documentPrompt) },
  summarizePrompt,
  chatLlm,
  outputParser,
]);

// Define the collapse chain to format, collapse, and parse a list of documents
const collapseChain = RunnableSequence.from([
  { context: async (documents: Document[]) => formatDocs(documents) },
  collapsePrompt,
  chatLlm,
  outputParser,
]);

// Define a function to collapse a list of documents until the total number of tokens is within the limit
const collapse = async (
  documents: Document[],
  options?: {
    config?: BaseCallbackConfig;
  },
  tokenMax = 4000
) => {
  const editableConfig = options?.config;
  let docs = documents;
  let collapseCount = 1;
  while ((await getNumTokens(docs)) > tokenMax) {
    if (editableConfig) {
      editableConfig.runName = `Collapse ${collapseCount}`;
    }
    const splitDocs = splitListOfDocs(docs, getNumTokens, tokenMax);
    docs = await Promise.all(
      splitDocs.map((doc) => collapseDocs(doc, collapseChain.invoke))
    );
    collapseCount += 1;
  }
  return docs;
};

// Define the reduce chain to format, combine, and parse a list of documents
const reduceChain = RunnableSequence.from([
  { context: formatDocs },
  combinePrompt,
  chatLlm,
  outputParser,
]).withConfig({ runName: "Reduce" });

// Define the final map-reduce chain
const mapReduceChain = RunnableSequence.from([
  RunnableSequence.from([
    { doc: new RunnablePassthrough(), content: mapChain },
    (input) =>
      new Document({
        pageContent: input.content,
        metadata: input.doc.metadata,
      }),
  ])
    .withConfig({ runName: "Summarize (return doc)" })
    .map(),
  collapse,
  reduceChain,
]).withConfig({ runName: "Map reduce" });

/**
 * View the full sequence on LangSmith
 * @link https://smith.langchain.com/public/f1c3b4ca-0861-4802-b1a0-10dcf70e7a89/r
 */

export async function mapReduceSummariseDocument(document) {
  const { text, ...metadata } = document;
  console.log("Summarising document", { metadata });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 3800,
    chunkOverlap: 100,
  });

  const docs = await splitter.splitDocuments([
    new Document({ pageContent: text, metadata }),
  ]);

  // const docs = text.split("\n\n").map(
  //   (pageContent) =>
  //     new Document({
  //       pageContent,
  //       metadata,
  //     })
  // );
  const result = await mapReduceChain.invoke(docs);
  // const result = [
  //   "The Delhi High Court issued a judgment in a dispute between Shakuntala and Rani over an eviction petition, detailing the case, arguments, and decision. The court ultimately dismissed the petition, upheld the previous ruling on rental payments, and explored the limitations of Article 227 of the Indian Constitution in court jurisdiction.",
  //   "The Delhi High Court judgment in Animesh Singh vs Sunita Jolly involves a dispute over possession of a property and payment of rent. The appellant admitted to being a tenant but claimed to have made payments towards purchasing the property. The court considered legal provisions on admissions and rent payments, ultimately remanding the case back to the trial court for further proceedings. The appeal was partially allowed and partially dismissed.",
  //   "The content discusses a judgment from the Delhi High Court regarding a petition filed under Article 227 of the Constitution of India against an order passed by the National Consumer Disputes Redressal Commission. The petitioners, who are directors of a company, challenged a direction to appear in person during execution proceedings. The court, after analyzing legal precedents, concluded that the order was discretionary and did not imply personal proceedings against the petitioners. The court upheld the order and clarified that the directors could seek exemption from personal appearance as allowed by law.",
  // ];
  return result;
}
