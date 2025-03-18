const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration based on the diagram
const apiScopes = [
    {"ui": "Client", "devportal": "client"},
    {"ui": "Client Mobile", "devportal": "client_mobile"},
    {"ui": "REST", "devportal": "rest"},
    {"ui": "Server Scoped", "devportal": "server"},
    {"ui": "Server Global", "devportal": "server_legacy"}
];

const version = "yokohama"; // ServiceNow release version
const outputDir = path.join(__dirname, 'output');

// AI API Configuration
const config = {
    // Ollama/LM Studio Configuration
    lmstudio: {
        baseUrl: "http://localhost:1234/v1",
        model: "qwen2.5-coder-14b-instruct"
    },
    // OpenRouter Configuration
    openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "google/gemini-2.0-flash-001"
    },
    // Process options
    processingOptions: {
        useAI: true,              // Set to false to skip AI processing
        aiProvider: "lmstudio",     // "lmstudio", "ollama", or "openrouter"
        batchSize: 5,             // Process in batches to avoid rate limits
        delayBetweenBatches: 5000 // Milliseconds to wait between batches
    }
};
const headers = {
    "Cookie": "notice_preferences=2:; notice_gdpr_prefs=0,1,2:; cmapi_gtm_bl=; cmapi_cookie_privacy=permit 1,2,3; BIGipServerpool_devportalprod=c9f68a527a3f785b10c73ae81e0add94; AMCVS_2A2A138653C66CB60A490D45%40AdobeOrg=1; glide_user_route=glide.e1476ef0e745babc933765dc1b5a9cde; glide_node_id_for_js=86c3abee6a0ee7b8ca79aec874ede947962141076601ec0d4df1b64321380258; bm_sz=813DA6B9B1C27A236AFFB15B45582FE7~YAAQu3p7XLELe46VAQAA2gEEqxs7G80PjkpjLdZxTa1QYzH//eKj9jk6g1CWGr+mrt/8fPInyCfQngWHwE2soOuFf6iLtmxiv+abxH+qwAoMxQRH15kv4zFXYSguUx8jisY+jSmHT9qgX91P9iU5zTjDAxvbpas2nD7E2PLtUxNFXuZlJ1iYN4YIWWuZrJgXu+S0gUBgHpd/C2xB475HnNlHHS6QONo7o/BvmslxgVOz/hdidzewmCsLcbT42cmwYu6jKkRnEcHvHc2KndXOXCSzEM6VmqUqTzOLIKkkuLTkHRiFndpdyc3OmM/AgLndRuEg858cX6gYc2bP7jZV+fmwShfX1dh/ACAIEpDz/r1qBGFGmfi5ZC7chg+vufRezw4zQJRf7rlSJgzjI6Yav+f/oA==~3229238~3687984; notice_behavior=expressed,eu; _abck=181605BA6B174593896679CF7EBA797C~0~YAAQu3p7XHEMe46VAQAA4wcEqw1ixXFFt6oodRkwCa6WEQnys1Dbp6mMFQrTqooaVZ3UCPlnZDE32sNAmT7gLyLli/5eBPVKTdXfHz/aLuoaWFr1svcsOVmFzm188QmcIVG48txjRaaqjmDAARf5PpIgg9y946mZR6V9WMhoND2U14rN+dX9ETK3mamv8NsYtL5/OoIkS1O1hrwjAFiK9WR0tapgaGb3NflWSubxVy+T8VC4c4OXlxzA6Tj1hxvSIcBopjRteqatY3SxacENyjM9wkCfZha1sG469AbWKD3neZFWjrwuuJ3JvU8dkEDfSD5PKEvZiqR7ne6jhnPVad57g9TlUEZUdioCKNJan80zTPPer9PWeNXLlkl0FWBc8bl+45RaE3dPEwMAB3r81hBvY1GENmMJFGTN9Wh2rIOslAnJjPgM+8DfZSyrtAKWuNBC3EB8Qrw+VH0XropSHq+AFxwQQovDL0ioO+/jGApHkyQ+6+kw6u0ONkEfkoM=~-1~||0||~-1; TAsessionID=9f06fc30-1688-4075-b896-3ce487175270|EXISTING; JSESSIONID=4F53D862FFDD85DFA83484A6D76D778A; sso_seamless_local=1742343989116; AMCV_2A2A138653C66CB60A490D45%40AdobeOrg=-408604571%7CMCIDTS%7C20165%7CMCMID%7C25021386690991074286449544109658458666%7CMCOPTOUT-1742347592s%7CNONE%7CvVersion%7C4.6.0%7CMCAID%7CNONE",
    "X-Usertoken": "8a2da87adb18e6545593c4be1396192b651132366bce4e41899ba1974bc5e6743578d004"
}

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function removeHtmlTagsAndElements(text) {
    if (!text) return '';

    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, '');

    // Remove specific elements
    const elementsToRemove = ['script', 'style', 'iframe'];
    elementsToRemove.forEach(element => {
        const regex = new RegExp(`<${element}[^>]*>.*?</${element}>`, 'gi');
        text = text.replace(regex, '');
    });

    // Remove multiple empty lines and replace with a single newline
    text = text.replace(/(\r?\n){2,}/g, '\n');

    // Trim leading and trailing whitespace
    return text.trim();
}

// Format a documentation entry using the DocPrompt template
function formatDocPrompt(docData) {
    const classData = docData.result.data.class_data;
    const methods = classData.children.filter(child => child.name); // Filter methods

    let promptsArray = [];

    // Process each method in the class
    for (const method of methods) {
        try {
            // Extract parameters
            const parameters = method.children?.filter(k => k.sectionHeader === "Parameters") || [];
            const paramString = parameters.map(param =>
                `- ${param.name} (${removeHtmlTagsAndElements(param.text)}): ${removeHtmlTagsAndElements(param.text2) || ''}`
            ).join('\n');

            // Extract returns
            const returns = method.children?.filter(k => k.sectionHeader === "Returns")[0] || {};
            const returnString = returns.text ?
                `- ${removeHtmlTagsAndElements(returns.name) || ''} (${removeHtmlTagsAndElements(returns.text) || ''}): ${removeHtmlTagsAndElements(returns.text2) || ''}.` :
                'void';

            // Extract example
            const example = method.children?.filter(k => k.name === "Example")[0] || {};
            const exampleString = example.text ?
                `Example code (${example.text2 || ''}): ${example.text || ''}` :
                '';

            // Build the DocPrompt format
            const prompt = `
Based on the following method from the ServiceNow documentation, generate 3 realistic questions that a developer might ask. Formulate the appropriate answer for each, including a code example. Start each Question with "Question 1:", "Question 2:", etc.

Method: ${classData.name}.${method.name}
Description: ${removeHtmlTagsAndElements(method.text) || ''}. ${removeHtmlTagsAndElements(method.text2) || ''}

Parameter:
${paramString}

Returns: ${returnString}

${exampleString}

Now generate 3 realistic questions & answers:
      `.trim();

            promptsArray.push({
                className: classData.name,
                methodName: method.name,
                prompt,
                metadata: {
                    version,
                    scope: docData.scope,
                    fullId: docData.id
                }
            });
        } catch (err) {
            console.error(`Error processing method ${method.name}: ${err.message}`);
        }
    }

    return promptsArray;
}

// Function 1: Send prompt to LMStudio or Ollama
async function sendToLocal(prompt) {
    try {
        const response = await axios.post(
            `${config.lmstudio.baseUrl}/chat/completions`,
            {
                model: config.lmstudio.model,
                messages: [
                    { role: "system", content: "You are a helpful ServiceNow developer assistant." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2048,
                top_p: 0.8,
                top_k: 20,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error(`LMStudio API error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`Failed to get response from LMStudio: ${error.message}`);
    }
}

// Function 2: Send prompt to OpenRouter.ai
async function sendToOpenRouter(prompt) {
    try {
        const response = await axios.post(
            `${config.openrouter.baseUrl}/chat/completions`,
            {
                model: config.openrouter.model,
                messages: [
                    { role: "system", content: "You are a helpful ServiceNow developer assistant." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 2048
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.openrouter.apiKey}`,
                    'HTTP-Referer': 'https://servicenow-docs-crawler',
                    'X-Title': 'ServiceNow Documentation Crawler'
                }
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error(`OpenRouter API error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`Failed to get response from OpenRouter: ${error.message}`);
    }
}

// Parse AI responses to extract question-answer pairs
function parseAIResponse(aiResponse) {
    if (!aiResponse || aiResponse.startsWith("ERROR:")) {
        return [];
    }

    const conversations = [];

    // Simple regex pattern matching for questions
    // Looking for patterns like "Question 1:" or "Q1:" or numbered questions
    const questionPattern = /(?:Question\s*(\d+)[:.]\s*|Q(\d+)[:.]\s*|(\d+)[:.]\s*)/g;

    let parts = aiResponse.split(questionPattern).filter(Boolean);

    // Process parts to extract questions and answers
    for (let i = 0; i < parts.length; i++) {
        // Skip the first part if it's just an introduction
        if (i === 0 && !isNaN(parts[i])) {
            continue;
        }

        // Check if the current part is a number (question index)
        if (!isNaN(parts[i]) && parts[i+1] && isNaN(parts[i+1])) {
            // This is a question number, and the next part is the question + answer
            const qaContent = parts[i+1].trim();

            // Try to split question and answer
            let questionEnd = qaContent.search(/\?|\.\s|\n/);
            if (questionEnd > 10) { // Ensure we have a reasonable question length
                const question = qaContent.substring(0, questionEnd + 1).trim();
                const answer = qaContent.substring(questionEnd + 1).trim();

                if (question && answer) {
                    conversations.push({ question, answer });
                }
            } else {
                // Try to find another split point if the first one failed
                const lines = qaContent.split('\n');
                if (lines.length > 1) {
                    const question = lines[0].trim();
                    const answer = lines.slice(1).join('\n').trim();

                    if (question && answer) {
                        conversations.push({ question, answer });
                    }
                }
            }

            i++; // Skip the next part as we've already processed it
        } else if (parts[i].includes('?')) {
            // This might be a question-answer pair without explicit numbering
            const qaContent = parts[i].trim();
            const questionEnd = qaContent.indexOf('?') + 1;

            if (questionEnd > 10) { // Ensure we have a reasonable question length
                const question = qaContent.substring(0, questionEnd).trim();
                const answer = qaContent.substring(questionEnd).trim();

                if (question && answer) {
                    conversations.push({ question, answer });
                }
            }
        }
    }

    // If regular parsing failed, try a more aggressive approach
    if (conversations.length === 0) {
        // Split by double newlines, which often separate QA pairs
        const blocks = aiResponse.split(/\n\s*\n/).filter(Boolean);

        for (let block of blocks) {
            // Look for question marks or sentence endings
            const questionEnd = block.search(/\?|\.\s/);
            if (questionEnd > 10 && questionEnd < block.length / 2) {
                const question = block.substring(0, questionEnd + 1).trim();
                const answer = block.substring(questionEnd + 1).trim();

                if (question && answer) {
                    conversations.push({ question, answer });
                }
            }
        }
    }

    return conversations;
}

// Helper function to process prompts with the selected AI provider
async function processPromptWithAI(promptData) {
    try {
        let aiResponse;
        console.log(`Processing prompt for ${promptData.className}.${promptData.methodName}`);

        if (config.processingOptions.aiProvider === "openrouter") {
            aiResponse = await sendToOpenRouter(promptData.prompt);
        } else {
            aiResponse = await sendToLocal(promptData.prompt);
        }

        // Add AI response to the prompt data
        return {
            ...promptData,
            aiResponse
        };
    } catch (error) {
        console.error(`Failed to process prompt for ${promptData.className}.${promptData.methodName}: ${error.message}`);
        // Return original data without AI response
        return {
            ...promptData,
            aiResponse: "ERROR: " + error.message
        };
    }
}

// Process prompts in batches to avoid rate limits
async function processBatch(prompts, writeStream, finetuneStream) {
    const { batchSize, delayBetweenBatches } = config.processingOptions;

    for (let i = 0; i < prompts.length; i += batchSize) {
        const batch = prompts.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(prompts.length/batchSize)}`);

        // Process the batch concurrently
        const processedBatch = await Promise.all(
            batch.map(async (prompt) => {
                if (config.processingOptions.useAI) {
                    return await processPromptWithAI(prompt);
                } else {
                    return prompt; // Skip AI processing
                }
            })
        );

        // Write the processed prompts to the JSONL file
        for (const processedPrompt of processedBatch) {
            // Write to the regular output file
            writeStream.write(JSON.stringify(processedPrompt) + '\n');

            // Write to the fine-tuning format file if there's an AI response
            if (processedPrompt.aiResponse && !processedPrompt.aiResponse.startsWith("ERROR:")) {
                // Parse the AI response to extract question-answer pairs
                const conversations = parseAIResponse(processedPrompt.aiResponse);

                // Create fine-tuning samples for each Q&A pair
                for (const conversation of conversations) {
                    // Format as a natural conversation for fine-tuning
                    const finetuneFormat = {
                        messages: [
                            {
                                role: "system",
                                content: "You are a helpful ServiceNow developer assistant with expertise in the ServiceNow JavaScript API."
                            },
                            {
                                role: "user",
                                content: conversation.question
                            },
                            {
                                role: "assistant",
                                content: conversation.answer
                            }
                        ],
                        metadata: {
                            className: processedPrompt.className,
                            methodName: processedPrompt.methodName,
                            version: processedPrompt.metadata.version,
                            scope: processedPrompt.metadata.scope
                        }
                    };

                    finetuneStream.write(JSON.stringify(finetuneFormat) + '\n');
                }
            }
        }

        // Wait before processing the next batch
        if (i + batchSize < prompts.length && config.processingOptions.useAI) {
            console.log(`Waiting ${delayBetweenBatches/1000} seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }
}

// Get user configuration via CLI
async function getUserConfig() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query) => new Promise((resolve) => rl.question(query, resolve));

    console.log("\n=== ServiceNow Documentation Crawler Configuration ===");

    // Ask for AI processing options
    const useAI = (await question("Use AI to generate examples? (y/n, default: y): ")).toLowerCase() !== 'n';

    if (useAI) {
        // Ask for AI provider
        console.log("\nSelect AI provider:");
        console.log("1. LM Studio (local)");
        console.log("2. Ollama (local)");
        console.log("3. OpenRouter.ai");
        const providerChoice = await question("Enter choice (1-3): ");

        if (providerChoice === '2') {
            config.processingOptions.aiProvider = "ollama";
            config.lmstudio.baseUrl = "http://localhost:11434/v1";
            config.lmstudio.model = await question("Enter Ollama model name (default: llama3): ") || "llama3";
            config.lmstudio.apiKey = "ollama";
        } else if (providerChoice === '3') {
            config.processingOptions.aiProvider = "openrouter";
            config.openrouter.apiKey = await question("Enter OpenRouter API key: ");
            const modelChoice = await question("Enter OpenRouter model ID (default: qwen/qwen-2.5-coder-32b-instruct): ");
            if (modelChoice) config.openrouter.model = modelChoice;
        }

        // Ask for batch size
        const batchSizeInput = await question("Enter batch size for API requests (default: 5): ");
        if (batchSizeInput) config.processingOptions.batchSize = parseInt(batchSizeInput);

        // Ask for delay between batches
        const delayInput = await question("Enter delay between batches in seconds (default: 5): ");
        if (delayInput) config.processingOptions.delayBetweenBatches = parseInt(delayInput) * 1000;
    } else {
        config.processingOptions.useAI = false;
    }

    rl.close();

    console.log("\nConfiguration complete. Starting crawler...\n");
    return config;
}

// Main crawler function
async function crawlServiceNowDocs() {
    // Get user configuration
    await getUserConfig();

    console.log(`Starting ServiceNow JS API crawler for version: ${version}`);
    console.log(`AI Processing: ${config.processingOptions.useAI ? 'Enabled' : 'Disabled'}`);
    if (config.processingOptions.useAI) {
        console.log(`AI Provider: ${config.processingOptions.aiProvider}`);
        if (config.processingOptions.aiProvider === "openrouter") {
            console.log(`OpenRouter Model: ${config.openrouter.model}`);
        } else {
            console.log(`Model: ${config.lmstudio.model}`);
        }
    }

    let totalDocs = 0;
    let allPrompts = [];

    // Process each API scope from the list
    for (const listEntry of apiScopes) {
        console.log(`\nProcessing scope: ${listEntry.ui} (${listEntry.devportal})`);

        try {
            // Step 1: Get the document identifier list for the current scope
            const navlistUrl = `https://developer.servicenow.com/devportal.do?sysparm_data=%7B%22action%22:%22api.navlist%22,%22data%22:%7B%22navbar%22:%22${listEntry.devportal}%22,%22release%22:%22${version}%22%7D%7D`;

            const navlistResponse = await axios.get(navlistUrl, {headers});
            const dcIdentifierList = navlistResponse.data[listEntry.devportal] || [];

            console.log(`Found ${dcIdentifierList.length} document identifiers for ${navlistUrl}`);

            // Step 2: Process each document in the identifier list
            for (const doc of dcIdentifierList) {
                if (!doc.dc_identifier) continue;

                console.log(`Processing document: ${doc.dc_identifier}`);

                // Step 3: Get extended documentation for the current document
                const docUrl = `https://developer.servicenow.com/devportal.do?sysparm_data=%7B%22action%22:%22api.docs%22,%22data%22:%7B%22id%22:%22${doc.dc_identifier}%22,%22release%22:%22${version}%22%7D%7D`;

                const docsResponse = await axios.get(docUrl, {headers});
                const extendedDocs = docsResponse.data;

                // Add the scope information to the extended docs object
                extendedDocs.scope = listEntry.devportal;
                extendedDocs.id = doc.dc_identifier;

                // Step 4: Format the documentation using DocPrompt
                const formattedPrompts = formatDocPrompt(extendedDocs);
                allPrompts = [...allPrompts, ...formattedPrompts];
                totalDocs += formattedPrompts.length;

                // Simple rate limiting to avoid API throttling
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`Error processing ${listEntry.ui}: ${error.message}`);
        }
    }

    console.log(`\nCrawling completed. Total documents processed: ${totalDocs}`);

    // Process all prompts with AI and save to JSONL
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `servicenow_${version}_docs_${timestamp}.jsonl`);
    const finetuneFile = path.join(outputDir, `servicenow_${version}_finetune_${timestamp}.jsonl`);

    // Create both file streams
    const writeStream = fs.createWriteStream(outputFile);
    const finetuneStream = fs.createWriteStream(finetuneFile);

    console.log(`\nProcessing prompts with AI and saving to:`);
    console.log(`- Complete data: ${outputFile}`);
    console.log(`- Fine-tuning data: ${finetuneFile}`);

    await processBatch(allPrompts, writeStream, finetuneStream);

    // Close both file streams
    writeStream.end();
    finetuneStream.end();

    console.log(`\nAll done! Results saved to:`);
    console.log(`- Complete data: ${outputFile}`);
    console.log(`- Fine-tuning data: ${finetuneFile}`);

    // Get stats on the conversations extracted
    const data = fs.readFileSync(finetuneFile, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    console.log(`- Extracted ${lines.length} question-answer pairs for fine-tuning`);
}

// Execute the crawler
crawlServiceNowDocs()
    .then(() => console.log('Process completed successfully!'))
    .catch(err => console.error('Crawler failed:', err));
