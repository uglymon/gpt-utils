import 'dotenv/config';
import { blue, blueBright, greenBright, red, yellowBright } from 'chalk';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';
import { createInterface } from 'readline';
import { DBManager, ShellManager, dbfunctions, shellfunctions } from './functions';
import { encoding_for_model } from '@dqbd/tiktoken';
import { hostname, platform, release, userInfo } from 'os';

const gptmodel: 'gpt-4' | 'gpt-3.5-turbo' = 'gpt-4';

export class AIUtil {
    private static enc_gpt = encoding_for_model(gptmodel);
    static encode = (text: string) => AIUtil.enc_gpt.encode(text);
    static tokenCount = (text: string) => AIUtil.encode(text).length;
    //    static cosine_distance = (a: number[], b: number[]): number => distance(a, b);
}

class OpenAI {
    private static openai: OpenAIApi | null = null;
    static get() {
        if (this.openai === null) {
            const key = process.env.OPENAI_KEY;
            if (key === undefined) return null;
            this.openai = new OpenAIApi(new Configuration({ apiKey: key }));
            console.log('OpenAI API initialized');
        }
        return this.openai;
    }
}
class GPTShell {
    username = userInfo().username;
    hostname = hostname();
    osinfo = `${platform()} ${release()}`;
    history: ChatCompletionRequestMessage[] = [];
    system_message: ChatCompletionRequestMessage = {
        role: 'system',
        content: 'You are an AI assistant that generates '
            + 'and executes the most efficient shell commands '
            + 'based on user requests, and aids users by analyzing the results.\n'
            + 'You can use run function to execute shell commands '
            + 'and receive result.\n'
            + 'If result is insufficient, you can use run function again until you get enough result.\n'
            + 'current timestamp : ' + new Date().toISOString() + '\n'
            + 'current timezone : ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '\n'
            + 'os info : ' + this.osinfo + '\n'
            + 'username : ' + this.username + '\n'
            + 'hostname : ' + this.hostname + '\n'
    };
    start(first_message: string) {
        this.history = [{ role: 'assistant', content: first_message }];
    }
    async chat(input: string) {
        const openai = OpenAI.get();
        if (openai === null) return null;
        this.history.push({ role: 'user', content: input });
        const messages: ChatCompletionRequestMessage[] = [this.system_message];
        messages.push(...this.history);
        const answer = await openai.createChatCompletion({
            model: gptmodel,
            messages,
            temperature: 0,
            functions: shellfunctions
        });
        if (answer === undefined) return null;
        console.log(red('tokens :'), answer.data.usage);
        const result = answer.data.choices[0].message;
        if (result === undefined) return null;

        if (result.function_call !== undefined) {
            const function_result = await ShellManager.run(result.function_call);
            const answer2 = await openai.createChatCompletion({
                model: gptmodel,
                messages: [this.system_message, ...this.history,
                { role: 'function', name: result.function_call.name, content: JSON.stringify(function_result) }],
                temperature: 0
            });
            if (answer2 === undefined) return null;
            console.log(red('tokens :'), answer2.data.usage);
            const result2 = answer2.data.choices[0].message;
            if (result2 === undefined) return null;
            this.history.push({ role: 'assistant', content: result2.content });
            return result2;
        }

        this.history.push({ role: 'assistant', content: result.content });
        return result;
    }
}

const main = async () => {
    const readline = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const first_message = yellowBright('=> ') + blueBright('Hello, I am a helpful assistant for computer system.');
    const dbchat = new GPTShell();
    dbchat.start(first_message);
    console.log(first_message);
    readline.setPrompt(greenBright('>> '));
    readline.prompt();
    readline.on('line', async (line) => {
        if (line === 'exit') {
            readline.close();

        } else if (line === 'history') {
            console.log(dbchat.history);

        } else if (line.trim().length > 0) {
            const answer = await dbchat.chat(line);
            if (answer !== null) {
                console.log(yellowBright('=>'), blueBright(answer.content));
            }
        }
        readline.prompt();
    });
    readline.on('close', () => {
        process.exit(0);
    });
};

main();