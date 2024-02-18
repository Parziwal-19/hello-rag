//@ts-ignore
import * as Spider from "node-spider";
//@ts-ignore
import * as TurndownService from "turndown";
import * as cheerio from "cheerio";
import parse from "url-parse";
import { join } from "path";
const turndownService = new TurndownService();

export type Page = {
  url: string;
  text: string;
  title: string;
  court: string;
  citations: string;
  author: string;
  bench: string;
};
class Crawler {
  pages: Page[] = [];
  limit: number = 1000;
  ids: string[] = [];
  spider: Spider | null = {};
  count: number = 0;
  textLengthMinimum: number = 200;

  constructor(
    ids: string[],
    limit: number = 1000,
    textLengthMinimum: number = 200
  ) {
    this.ids = ids;
    this.limit = limit;
    this.textLengthMinimum = textLengthMinimum;

    this.count = 0;
    this.pages = [];
    this.spider = {};
  }

  handleRequest = (doc: any) => {
    const $ = cheerio.load(doc.res.body);
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

    const htmlContent = doc.res.body;
    const idForRun = doc.url.split("/")[4];
    const filePath = join(
      "/Users/ishanjoglekar/Documents/GitHub/illegal-chats/",
      "public",
      "original_htmls",
      `${idForRun}.html`
    );

    try {
      writeFileSync(filePath, htmlContent);
      console.log(`HTML content saved for ID: ${idForRun}`);
    } catch (error) {
      console.error(`Failed to save HTML content for ID: ${idForRun}`, error);
    }

    const text = turndownService.turndown(content);
    console.log("crawling ", doc.url);
    const page: Page = {
      url: doc.url,
      text,
      title,
      court,
      citations,
      author,
      bench,
    };
    if (text.length > this.textLengthMinimum) {
      this.pages.push(page);
    }
    // console.log(page);

    // doc.$("a").each((i: number, elem: any) => {
    //   var href = doc.$(elem).attr("href")?.split("#")[0];
    //   var targetUrl = href && doc.resolve(href);
    //   // crawl more
    //   if (targetUrl && this.urls.some(u => {
    //     const targetUrlParts = parse(targetUrl);
    //     const uParts = parse(u);
    //     return targetUrlParts.hostname === uParts.hostname
    //   }) && this.count < this.limit) {
    //     this.spider.queue(targetUrl, this.handleRequest);
    //     this.count = this.count + 1
    //   }
    // });
  };

  start = async () => {
    this.pages = [];
    return new Promise((resolve, reject) => {
      this.spider = new Spider({
        concurrent: 5,
        delay: 0,
        allowDuplicates: false,
        catchErrors: true,
        addReferrer: false,
        xhr: false,
        keepAlive: false,
        error: (err: any, url: string) => {
          console.log(err, url);
          reject(err);
        },
        // Called when there are no more requests
        done: () => {
          resolve(this.pages);
        },
        headers: { "user-agent": "node-spider" },
        encoding: "utf8",
      });
      // console.log('here')
      //  console.log(this.ids)
      this.ids.forEach((id) => {
        this.spider.queue(
          "https://indiankanoon.org/doc/" + id + "/",
          this.handleRequest
        );
      });
    });
  };
}

export { Crawler };
