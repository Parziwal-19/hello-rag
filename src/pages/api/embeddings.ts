import { Pinecone } from "@pinecone-database/pinecone";
import { isEmpty } from "lodash";

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
  topK: number,
  getValues = false,
  filter
): Promise<ScoredVector[]> => {
  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME!);
  const queryRequest = {
    vector: embeddings,
    topK,
    includeMetadata: true,
    includeValues: getValues,
    ...(!isEmpty(filter) ? { filter } : {}),
  };
  try {
    const queryResult = await index.query(queryRequest);
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
