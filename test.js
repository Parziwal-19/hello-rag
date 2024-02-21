import { Pinecone } from "@pinecone-database/pinecone";
import fs from "fs";
import JSONStream from "JSONStream";

import Bottleneck from "bottleneck";

// Replace 'first10k.json' with the name of your JSON file
const BATCH_SIZE = 100; // Adjust batch size as needed

const pinecone = await new Pinecone({
  apiKey: "1799f928-6150-4d71-bbc1-38f6798a3dc7",
});
const pineconeIndexName = "judgements";
const index = pinecone && pinecone.Index(pineconeIndexName);

const filePath = "./first10k.json";
const limiter = new Bottleneck({
  minTime: 30,
});
// Function to process a batch of elements
function processBatch(batch) {
  // Perform your operation on the batch here
  console.log("Processing batch:");
  console.log(batch);
  upsertBatch(batch.map((e) => e.vector)).then((c) =>
    console.log("Processed Batch of " + batch.length)
  );
}

// Create a read stream for the input JSON file
const inputStream = fs.createReadStream(filePath, { encoding: "utf8" });

// Parse JSON from the stream
const jsonStream = JSONStream.parse("*");

// Pipe the input stream through the JSON parser
inputStream.pipe(jsonStream);

let batch = [];
let count = 0;

// Listen for 'data' events emitted by the JSON parser
jsonStream.on("data", (element) => {
  // Add element to the batch
  batch.push(element);
  count++;

  // If batch size is reached, process the batch and reset
  if (count === BATCH_SIZE) {
    processBatch(batch);
    batch = [];
    count = 0;
  }
});

// Handle errors
jsonStream.on("error", (err) => {
  console.error("Error parsing JSON:", err);
});

// Handle the end of the input stream
inputStream.on("end", () => {
  // Process the remaining elements if the batch is not empty
  if (batch.length > 0) {
    processBatch(batch);
  }
  console.log("End of file reached");
});

// const wrappedUpsert = limiter.wrap(index.upsert);

const upsertBatch = (chunk) => {
  try {
    return index.upsert(chunk);
  } catch (e) {
    console.log(e);
  }
};
