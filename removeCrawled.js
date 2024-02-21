const fs = require("fs");
const idsToProcess = JSON.parse(fs.readFileSync("idsToProcess.json", "utf8"));
const toRemove = JSON.parse(fs.readFileSync("toRemove.json", "utf8"));

const nonCrawledPages = idsToProcess.filter((id) => !toRemove.includes(id));
console.log(nonCrawledPages.length());

fs.writeFileSync("idsToProcessNew.json", JSON.stringify(nonCrawledPages));
