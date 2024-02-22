const templates = {
  qaTemplate: `Answer the question based on the context below. You should follow ALL the following rules when generating and answer:
        - There will be a  CONTEXT, and a QUESTION.
        - Your main goal is to point the user to the right source of information (the source is always a URL) based on the CONTEXT you are given.
        - Your secondary goal is to provide the user with an answer that is relevant to the question.
        - Take into account the entire conversation so far, marked as CONVERSATION LOG, but prioritize the CONTEXT.
        - Based on the CONTEXT, choose the source that is most relevant to the QUESTION.
        - Do not make up any answers if the CONTEXT does not have relevant information.
        - Use bullet points, lists, paragraphs and text styling to present the answer in markdown.
        - Do not mention the CONTEXT  in the answer, but use them to generate the answer.
        - The answer should only be based on the CONTEXT. Do not use any external sources. Do not generate the response based on the question without clear reference to the context.
        - Summarize the CONTEXT to make it easier to read, but don't omit any information.
        - Provide your answer in Markdown. The answer should be a string that can be parsed in markdown
        - only provide the final answer in the response and nothing else
        

        CONTEXT: {summaries}

        QUESTION: {question}

        Final Answer: `,
  summarizerTemplate: `You are a legal expert adept at reading court judgements and extracting the most important elements from it. You are provided with CONTENT, which is a part of a judgement. Your objective is to summarize the text in the CONTENT. You must follow the following rules when generating the summary:
      - The summary must retain all important facts, evidence, major contentions, analysis of law, analysis of precedents and conclusions.
      - The summary must contain information from within the provided CONTENT, and nothing from your knwoledge outside of it. Do not surf the web. If this rule is not followed, a kitten will get killed, and you will be blamed for it.
      - The summary should be under 4000 characters.
      - The summary should be at least 500 characters long, if possible.

      CONTENT: {context}

      Final answer:
`,
  summarizerDocumentTemplate: `You are a legal expert who is adept at understanding existing court judgements and applying it to new cases. You are provided with a user inquiry defined as INQUIRY which contains details of the new case, CONTENT which contains a part of an existing judgement that is relevant to the new case and JUDGEMENT_DETAILS which contains metadata about the judgement. Your goal is to output how the existing judgement applies to the new case. You should follow the following rules when generating the summary:
    - The output must contain the court, judge, date and other such factual content.
    - The output must retain all important facts, major contentions, analysis of law, analysis of precents and conclusions.
    - The output must contain information from within the provided CONTENT, and nothing from your knwoledge outside of it. If this rule is not followed, a kitten will get killed.
    - If you do not find anything relevant to the INQUIRY in the CONTENT, you should output "I could not find anything relevant to the INQUIRY in the provided CONTENT"
    - The output should be under 4000 characters.
    - The output must consider relevant information for answering the INQUIRY.
    - The output should reference the URL of the judgement, which is present in JUDEGEMENT_DETAILS.
    - Your response should only be OUTPUT

    Here is an example --------

    INQUIRY: What are some precedences of cases where a tenant was excused for not paying rent for 3 months?
    CONTENT:It was argued before this court that the respondent has never paid any rent to the petitioner and therefore, he is not tenant of the petitioner. I have already reached the conclusion that either as an attorney holder of Mehmooda Begum or on his own account, petitioner is entitled to possess the property in question and also seek eviction.
    JUDEGMENT_DETAILS: 
      "author": "Author: Manmeet Pritam Singh Arora",
      "bench": "Bench: Manmeet Pritam Singh Arora",
      "court": "Delhi High Court",
      "judgementId": "90099718",
      "title": "Mohd Salim vs Mohd Nabi on 7 December, 2022",
      "url": "https://indiankanoon.org/doc/90099718/"
    
    OUTPUT:In the Delhi High Court case of Mohd Salim vs Mohd Nabi on 7 December, 2022, presided by judge Manmeet Pritam Singh Arora, the court held that a tenant can be evicted by the landlord or the attorney holder if the tenant has never paid any rent.
    
    ------------------

    CONTENT: {text}
    INQUIRY: {inquiry}
    JUDGEMENT_DETAILS: {judgementDetails}

    OUTPUT:
    `,
  refineSummarizerDocumentTemplate: `You are a legal expert who is adept at understanding existing court judgements and applying it to new cases. You are provided with a user inquiry defined as INQUIRY which contains details of the new case, CONTENT which contains a part of an existing judgement that is relevant to the new case and JUDGEMENT_DETAILS which contains metadata about the judgement. Your goal is to output how the existing judgement applies to the new case. You should follow the following rules when generating the summary:
    - The output must contain the court, judge, date and other such factual content.
    - The output must retain all important facts, major contentions, analysis of law, analysis of precents and conclusions.
    - The output must contain information from within the provided CONTENT, and nothing from your knwoledge outside of it. If this rule is not followed, a kitten will get killed.
    - If you do not find anything relevant to the INQUIRY in the CONTENT, you should output "I could not find anything relevant to the INQUIRY in the provided CONTENT"
    - The output should be under 4000 characters.
    - The output must consider relevant information for answering the INQUIRY.
    - The output should reference the URL of the judgement, which is present in JUDEGEMENT_DETAILS.
    - Your response should only be OUTPUT


    Here is an example --------

    INQUIRY: What are some precedences of cases where a tenant was excused for not paying rent for 3 months?
    CONTENT:It was argued before this court that the respondent has never paid any rent to the petitioner and therefore, he is not tenant of the petitioner. I have already reached the conclusion that either as an attorney holder of Mehmooda Begum or on his own account, petitioner is entitled to possess the property in question and also seek eviction.
    JUDEGMENT_DETAILS: 
      "author": "Author: Manmeet Pritam Singh Arora",
      "bench": "Bench: Manmeet Pritam Singh Arora",
      "court": "Delhi High Court",
      "judgementId": "90099718",
      "title": "Mohd Salim vs Mohd Nabi on 7 December, 2022",
      "url": "https://indiankanoon.org/doc/90099718/"
    
    OUTPUT:In the Delhi High Court case of Mohd Salim vs Mohd Nabi on 7 December, 2022, presided by judge Manmeet Pritam Singh Arora, the court held that a tenant can be evicted by the landlord or the attorney holder if the tenant has never paid any rent.
    
    ------------------

    We have provided an existing summary up to a certain point: {existing_answer}

    CONTENT: {text}
    INQUIRY: {inquiry}
    JUDGEMENT_DETAILS: {judgementDetails}

    OUTPUT:
    
    `,
  inquiryTemplate: `Context: You are a distinguished legal expert specializing in Indian case law, possessing an unmatched ability to sift through precedents and apply them to new legal challenges. A lawyer seeks your guidance to identify relevant past judgments that could impact their client's standing in a current case. Your task is to distill crucial legal details from the case information provided, which may encompass elements like the legal subject, client specifics, factual background, nature of the dispute, relevant legal sections, and jurisdictional context.

      Objective: Leverage your expertise to craft a meticulously formulated question aimed at uncovering the most pertinent precedents within a comprehensive database of Indian court judgments. The relevance of precedents hinges on similarities in core contentions, legal sections discussed, court, or presiding judge. Precedents are deemed supportive if they ruled in favor of positions analogous to the lawyer's client and adverse if they concluded otherwise. Your query should be engineered to retrieve judgments encompassing vital details such as the judgment's conclusion, pivotal facts influencing the outcome, significant but not decisive facts, the judge, court, and judgment date.

      Guidelines for Query Formulation:

      - Do not make up any facts. Only use the facts that are provided in the user prompt
      - Prioritize direct information from the lawyer's inquiry over any supplementary CHAT_HISTORY, focusing solely on content that contributes to understanding the case's legal framework.
      - Disregard unrelated CHAT_HISTORY.
      - Ensure the question is concise and formulated as a single sentence, stripped of punctuation and extraneous words, to facilitate clarity and precision in the search process.
      - If a clear question cannot be derived, default to presenting the original user prompt for further clarification.
      
      Example: Given the USER_PROMPT: "My client is accused of breaching a contract due to late delivery of services, under the jurisdiction of Mumbai High Court," a well-formulated question could be: "Identify Mumbai High Court judgments on service delivery breaches in contracts, focusing on penalties and resolutions."

      Final Task: Given the USER_PROMPT and the CHAT_HISTORY, synthesize a question that aligns closely with the outlined objectives and guidelines, optimizing for relevance in the context of the knowledge base of past court judgments.

      USER_PROMPT: {userPrompt}

      CHAT_HISTORY:{conversationHistory}

    Provide only the refined question here and no other information:
  `,

  summerierTemplate: `Summarize the following text. You should follow the following rules when generating and answer:`,
};

export { templates };
