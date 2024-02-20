//@ts-ignore

import * as TurndownService from "turndown";
import * as cheerio from "cheerio";

const turndownService = new TurndownService();

const cleanHTMLString = (htmlString: any, id: string) => {
  const $ = cheerio.load(htmlString);
  $("script").remove();
  $("#hub-sidebar").remove();
  $("header").remove();
  $("nav").remove();
  $("img").remove();
  const title = $("title").text() || $(".article-title").text();
  //const html = $("body").html();
  const court = $(".judgments .docsource_main").text();
  //const title = $('.judgments .doc_title').text();
  const citations = $(".judgments .doc_citations").text();
  const author = $(".judgments .doc_author").text();
  const bench = $(".judgments .doc_bench").text();
  const content = $(".judgments").text();

  const text = turndownService.turndown(content);
  const page = {
    url: "https://indiankanoon.org/doc/" + id + "/",
    text,
    title,
    court,
    citations,
    author,
    bench,
    id,
  };

  return page;
};
const handleCleaningRequest = (ids: string[]) => {
  const fs = require("fs");
  const path = require("path");
  const documentsDir = path.resolve("./public/documents");
  const documentStrings = ids.map((id) => {
    const filePath = path.join(documentsDir, `${id}.html`);
    const htmlString = fs.readFileSync(filePath, "utf8");
    return cleanHTMLString(htmlString, id);
  });
  return documentStrings;
};

export { handleCleaningRequest };
