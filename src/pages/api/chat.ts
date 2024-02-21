// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { Pinecone } from "@pinecone-database/pinecone";
import * as Ably from "ably";
import { CallbackManager } from "langchain/callbacks";
import {
  LLMChain,
  loadQARefineChain,
  loadSummarizationChain,
} from "langchain/chains";
// import { ChatOpenAI } from "langchain/chat_models";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { OpenAI, ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import type { NextApiRequest, NextApiResponse } from "next";

import { uuid } from "uuidv4";
import { summarizeLongDocument } from "./summarizer";

import { ConversationLog } from "./conversationLog";
import { Metadata, getMatchesFromEmbeddings } from "./embeddings";
import { templates } from "./templates";
import { formatDocumentsAsString } from "langchain/util/document";
import { uniq, uniqBy } from "lodash";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import {
  RunnableMap,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PineconeStore } from "@langchain/pinecone";
import { handleCleaningRequest } from "utils/cleanHtml";

const TOP_K = 5;
const namespace = process.env.NAMESPACE;

const llm =
  process.env.USE_OPEN_AI === "true"
    ? new OpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-3.5-turbo-0125",
      })
    : new OpenAI({
        openAIApiKey: "7rxSQ5eO82L2VokihrBQX3vxY4wSKqwX",
        configuration: {
          baseURL: "https://api.deepinfra.com/v1/openai",
        },
        modelName: "meta-llama/Llama-2-70b-chat-hf",
      });

const chatLlm =
  process.env.USE_OPEN_AI === "true"
    ? new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-3.5-turbo-0125",
      })
    : new ChatOpenAI({
        openAIApiKey: "7rxSQ5eO82L2VokihrBQX3vxY4wSKqwX",
        modelName: "meta-llama/Llama-2-70b-chat-hf",
        configuration: {
          baseURL: "https://api.deepinfra.com/v1/openai",
        },
      });

const USE_OPEN_AI_EMBEDDING = process.env.USE_OPEN_AI_EMBEDDING === "true";

const embeddings = USE_OPEN_AI_EMBEDDING
  ? new OpenAIEmbeddings({
      modelName: process.env.OPEN_AI_EMBEDDING_MODEL,
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
  : new HuggingFaceTransformersEmbeddings({
      modelName: "Xenova/bge-m3",
    });

let pinecone: Pinecone | null = null;

// const initPineconeClient = async () => {
//   pinecone = new Pinecone({
//     apiKey: process.env.PINECONE_API_KEY!,
//   });
// };

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });

const handleRequest = async ({
  prompt,
  userId,
}: {
  prompt: string;
  userId: string;
}) => {
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  let summarizedCount = 0;

  try {
    const channel = ably.channels.get(userId);
    const interactionId = uuid();

    // Retrieve the conversation log and save the user's prompt
    const conversationLog = new ConversationLog(userId);
    const clear = async () => await conversationLog.clearConversation();
    await clear();
    const conversationHistory = await conversationLog.getConversation({
      limit: 10,
    });
    console.log(conversationHistory);

    //TODO: clear context if talking about a new judgement
    const formatChatHistory = (chatHistory: string[]) => {
      return chatHistory.join("\n");
    };

    await conversationLog.addEntry({ entry: prompt, speaker: "user" });

    const pineconeIndex = pinecone!.Index(process.env.PINECONE_INDEX_NAME!);

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace: namespace,
    });

    const CONDENSE_QUESTION_PROMPT = PromptTemplate.fromTemplate(
      templates.inquiryTemplate
    );

    const standaloneQuestionChain = RunnableSequence.from([
      {
        userPrompt: (p) => prompt,
        conversationHistory: () => formatChatHistory(conversationHistory),
      },
      CONDENSE_QUESTION_PROMPT,
      chatLlm,
      new StringOutputParser(),
    ]);
    const inquiry = await standaloneQuestionChain.invoke({ question: prompt });
    // const inquiry =
    //   "\n" +
    //   "Question: Identify precedents where defenses or mitigating circumstances relating to unauthorized plot transfers have led to favorable outcomes in Delhi court jurisdiction.";

    console.log({ inquiry });

    // const retrievedDocuments = await vectorStore.similaritySearch(inquiry, 5);
    const embeddingVectors = await embeddings.embedQuery(inquiry);
    console.log(embeddingVectors);
    const matches = await getMatchesFromEmbeddings(
      embeddingVectors,
      pinecone!,
      TOP_K
    );

    console.log("retrievedDocuments");
    console.log(JSON.stringify(matches));
    const matchedDocumentIds =
      matches &&
      Array.from(
        new Set(
          matches.map((match) => {
            const metadata = match.metadata as Metadata;
            const { judgementId } = metadata;
            return judgementId;
          })
        )
      );
    console.log({ matchedDocumentIds });
    const documentsToBeSummarised = handleCleaningRequest(matchedDocumentIds);

    const SUMMARY_PROMPT = new PromptTemplate({
      inputVariables: ["text", "inquiry"],
      template: templates.summarizerDocumentTemplate,
    });

    const SUMMARY_REFINE_PROMPT = new PromptTemplate({
      inputVariables: ["text", "inquiry", "existing_answer"],
      template: templates.refineSummarizerDocumentTemplate,
    });

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2048,
      chunkOverlap: 1,
    });

    const splitDocs = await splitter.createDocuments(
      documentsToBeSummarised.map((t) => t.text)
    );

    const summarisationChain = loadSummarizationChain(chatLlm, {
      questionPrompt: SUMMARY_PROMPT,
      refinePrompt: SUMMARY_REFINE_PROMPT,
      type: "refine",
      verbose: false,
    });
    console.log(
      "summarising................................................................"
    );
    const summaries = await summarisationChain.invoke({
      input_documents: splitDocs,
      inquiry,
    });

    console.log({ summaries });
    // const summaries = {
    //   output_text:
    //     "    The above text is a sample input text for testing the summarization of a given document into a summary. This input text has been generated using natural language generation (NLG) techniques and it contains the following content:   \\n\\n- Rent Control Act received assent from the President.\\n- The Supreme Court in Puwada Venkateswara Rao v C.V Ramana also held that Andhra Pradesh Buildings (Lease,Rent,Eviction) Control Act is a complete code dealing with the relationship of landlord and tenant in respect of buildings governed by that Act.\\n- The Supreme Court approved of the decision of this court in Uligappa v S.Mohan Rao (supra)\\n- An analysis of the Tamil Nadu Buildings (Lease,Rent & Eviction) Control Act would show that it provides a complete code for every contingency that is likely to arise in the relationship of landlord and tenant.\\n\\nThe Supreme Court held that Andhra Pradesh Buildings (Lease, Rent, Eviction) Control Act is a complete code dealing with the relationship of landlord and tenant in",
    // };
    const ANSWER_PROMPT = PromptTemplate.fromTemplate(templates.qaTemplate);
    const answerChain = RunnableSequence.from([
      {
        summaries: () => summaries.output_text,
        question: () => prompt,
      },
      ANSWER_PROMPT,
      chatLlm,
      new StringOutputParser(),
    ]);

    const result = await answerChain.invoke({});

    console.log({ result });
    try {
      channel.publish({
        data: {
          event: "response",
          token: result,
          interactionId,
        },
      });
    } catch (e) {
      console.log(e);
    }

    channel.publish({
      data: {
        event: "status",
        message: "Finding matches...",
      },
    });
    // // const matches = await vectorStore.similaritySearch(prompt, 3);
    // // // const matches = await getMatchesFromEmbeddings(
    // // //   embeddings,
    // // //   pinecone!,
    // // //   TOP_K
    // // // );
    // // console.log(matches);
    // // console.log(matches.map((m) => m.score));

    // // const urls =
    // //   matches &&
    // //   Array.from(
    // //     new Set(
    // //       matches.map((match) => {
    // //         const metadata = match.metadata as Metadata;
    // //         const { url } = metadata;
    // //         return url;
    // //       })
    // //     )
    // //   );

    // // const docs =
    // //   matches &&
    // //   Array.from(
    // //     matches.reduce((map, match) => {
    // //       const metadata = match.metadata as Metadata;
    // //       const { text, url, court, title, citations, author, bench } =
    // //         metadata;
    // //       if (!map.has(url)) {
    // //         map.set(url, text);
    // //       }
    // //       return map;
    // //     }, new Map())
    // //   ).map(([_, text]) => text);

    // // const promptTemplate = new PromptTemplate({
    // //   template: templates.qaTemplate,
    // //   inputVariables: ["summaries", "question", "conversationHistory", "urls"],
    // // });

    // // console.log(docs);
    // // try {
    // //   const chat = new ChatOpenAI({
    // //     openAIApiKey: "gaandHiMaraLe",
    // //     configuration: {
    // //       baseURL: "http://localhost:1234/v1/chat",
    // //     },
    // //     // streaming: true,
    // //     // verbose: true,
    // //     // modelName: "gpt-3.5-turbo",
    // //     //   callbackManager: CallbackManager.fromHandlers({
    // //     //     async handleLLMNewToken(token) {
    // //     //       console.log(token);

    // //     //       channel.publish({
    // //     //         data: {
    // //     //           event: "response",
    // //     //           token: token,
    // //     //           interactionId,
    // //     //         },
    // //     //       });
    // //     //     },
    // //     //     async handleLLMEnd(result) {
    // //     //       channel.publish({
    // //     //         data: {
    // //     //           event: "responseEnd",
    // //     //           token: "END",
    // //     //           interactionId,
    // //     //         },
    // //     //       });
    // //     //     },
    // //     //   }),
    // //   });

    // //   // const chain = new LLMChain({
    // //   //   prompt: promptTemplate,
    // //   //   llm: chat,
    // //   // });

    // //   const allDocs = docs.join("\n");
    // //   console.log(allDocs.length);
    // //   if (allDocs.length > 4000) {
    // //     channel.publish({
    // //       data: {
    // //         event: "status",
    // //         message: `Just a second, forming final answer...`,
    // //       },
    // //     });
    // //   }
    // //   console.log("summarisingggg");
    // //   const summary =
    // //     allDocs.length > 4000
    // //       ? await summarizeLongDocument({ document: allDocs, inquiry })
    // //       : allDocs;

    // //   // console.log(summary);
    // //   const outputParser = new StringOutputParser();
    // //   const setupAndRetrieval = RunnableSequence;

    // //   await chain.call({
    // //     summaries: allDocs,
    // //     question: prompt,
    // //     conversationHistory,
    // //     urls,
    // //   });
    // //   console.log(allDocs.length);
    // // } catch (e) {
    // //   console.log(e);
    // // }
  } catch (error) {
    //@ts-ignore
    console.error(error);
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { body } = req;
  const { prompt, userId } = body;
  await handleRequest({ prompt, userId });
  res.status(200).json({ message: "started" });
}
