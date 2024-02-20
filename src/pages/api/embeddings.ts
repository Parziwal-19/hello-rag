import { Pinecone } from "@pinecone-database/pinecone";

export type Metadata = {
  url: string;
  text: string;
  title: string;
  court: string;
  citations: string;
  author: string;
  bench: string;
  judgementId: string;
};

export const getMatchesFromEmbeddings = async (
  embeddings: number[],
  pinecone: Pinecone,
  topK: number
): Promise<ScoredVector[]> => {
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME!);
  const queryRequest = {
    vector: embeddings,
    topK,
    includeMetadata: true,
  };
  try {
    const queryResult = await index.namespace("openAI").query(queryRequest);
    console.log(queryResult);
    return (
      queryResult.matches?.map((match) => ({
        ...match,
        metadata: match.metadata as Metadata,
      })) || []
    );
  } catch (e) {
    console.log("Error querying embeddings: ", e);
    throw new Error(`Error querying embeddings: ${e}`);
  }
};
