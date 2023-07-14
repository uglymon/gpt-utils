import 'dotenv/config';
import { blue, blueBright, greenBright, red, yellowBright } from 'chalk';
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';
import { createInterface } from 'readline';
import { DBManager, dbfunctions } from './functions';
import mariadb from 'mariadb';
import { encoding_for_model } from '@dqbd/tiktoken';

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
class DBChat {
    history: ChatCompletionRequestMessage[] = [];
    system_message: ChatCompletionRequestMessage = {
        role: 'system',
        content: 'You are helpful assistant for computer database system.\n'
            + 'current timestamp : ' + new Date().toISOString() + '\n'
            + 'current timezone : ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '\n'
            + 'You have to answer only about database system.\n'
            + 'If you need to access database, you can use runsql function with SQL queries.\n'
    };
    start(first_message: string) {
        this.history = [{ role: 'assistant', content: first_message }];
    }
    async chat(input: string) {
        const openai = OpenAI.get();
        if (openai === null) return null;
        const dbinfomsg: ChatCompletionRequestMessage = {
            role: 'system', content: 'You can reference database information below.\n'
                + JSON.stringify(DBManager.info) + '\n'
        };
        this.history.push({ role: 'user', content: input });
        const messages: ChatCompletionRequestMessage[] = [this.system_message];
        if (Object.keys(DBManager.info).length > 0) messages.push(dbinfomsg);
        messages.push(...this.history);
        const answer = await openai.createChatCompletion({
            model: gptmodel,
            messages,
            temperature: 0,
            functions: dbfunctions
        });
        if (answer === undefined) return null;
        console.log(red('tokens :'), answer.data.usage);
        const result = answer.data.choices[0].message;
        if (result === undefined) return null;

        if (result.function_call !== undefined) {
            const function_result = await DBManager.run(result.function_call);
            const answer2 = await openai.createChatCompletion({
                model: gptmodel,
                messages: [this.system_message, dbinfomsg, ...this.history,
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

    const first_message = yellowBright('=> ') + blueBright('Hello, I am a helpful assistant for computer database system.');
    const dbchat = new DBChat();
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