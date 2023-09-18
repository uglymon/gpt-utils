import { ChatCompletionFunctions, ChatCompletionRequestMessageFunctionCall } from 'openai';
import mariadb from 'mariadb';
import { yellow, green, blue } from 'chalk';

export const dbfunctions: ChatCompletionFunctions[] = [
    {
        name: 'connect',
        description: 'Connect to database',
        parameters: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['mysql', 'postgresql', 'sqlite'],
                    description: 'Database type : use info directly entered by user, or infer from other information'
                },
                host: {
                    type: 'string',
                    description: 'Database host by user information'
                },
                port: {
                    type: 'number',
                    description: 'Database port by user information'
                },
                user: {
                    type: 'string',
                    description: 'Database user by user information'
                },
                password: {
                    type: 'string',
                    description: 'Database password by user information'
                },
                database: {
                    type: 'string',
                    description: 'Database name by user information'
                }
            },
            required: ['type', 'host', 'port', 'user', 'password', 'database']
        }
    },
    {
        name: 'runsql',
        description: 'Run SQL queries sequentially',
        parameters: {
            type: 'object',
            properties: {
                queries: {
                    type: 'array',
                    description: 'SQL query, only select statement is allowed',
                    items: {
                        type: 'string'
                    }
                }
            },
            required: ['queries']
        }
    },
];

export class DBManager {
    private static _instance: DBManager | null = null;
    private mysql_pool: mariadb.Pool | null = null;

    dbinfo: { [key: string]: any } = {};
    static get info() {
        if (this._instance === null) this._instance = new DBManager();
        return this._instance.dbinfo;
    }

    static async run(info: ChatCompletionRequestMessageFunctionCall) {
        const function_name = info.name;
        const function_args = JSON.parse(info.arguments as string);
        let result = { message: 'ok', data: '' as any };
        console.log(`${yellow('function call')} : ${green(function_name)}(`, function_args, green(')'));
        if (this._instance === null) this._instance = new DBManager();
        if (function_name === 'connect') {
            this._instance.mysql_pool = mariadb.createPool({
                host: function_args.host,
                port: function_args.port,
                user: function_args.user,
                password: function_args.password,
                database: function_args.database,
                bigIntAsNumber: true
            });
            if (this._instance.mysql_pool === null) {
                result.message = 'connection failed';
            } else {
                const tables = await this._instance.mysql_pool.query('show tables');
                this._instance.dbinfo = {
                    dbtype: function_args.type,
                    columnformat: ['field', 'type', 'null', 'key', 'default', 'extra']
                };
                for (const table of tables) {
                    for (const key in table) {
                        this._instance.dbinfo[table[key]] = [];
                        const table_info = await this._instance.mysql_pool.query(`desc ${table[key]}`);
                        for (const column of table_info) {
                            this._instance.dbinfo[table[key]].push([column.Field, column.Type, column.Null, column.Key, column.Default, column.Extra]);
                        }
                    }
                }
                result.message = 'connection success';
            }
        } else if (function_name === 'runsql') {
            if (this._instance.mysql_pool === null) return null;
            const pool = this._instance.mysql_pool;
            const conn = await pool.getConnection();
            const queries = function_args.queries;
            let onlyselect = true;
            for (const query of queries) {
                if (query.toLowerCase().startsWith('select') === false) {
                    onlyselect = false;
                    break;
                }
            }
            if (onlyselect === false) {
                result.message = 'only select statement is allowed';
            } else {
                result.data = [];
                for (const query of queries) {
                    try {
                        const res = await conn.query(query);
                        result.data.push(res);
                    } catch (e: any) {
                        result.data.push({
                            sql: e.sql,
                            sqlMessage: e.sqlMessage,
                        });
                    }
                }
            }
            conn.release();
        } else {
            result.message = 'unknown function';
        }
        console.log(`${yellow('function result')} : ${blue(result.message)} `);
        return result;
    }
}

export const shellfunctions: ChatCompletionFunctions[] = [
    {
        name: 'run',
        description: 'run shell command',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'command to run'
                },
            },
            required: ['command']
        },
    }
];
export class ShellManager {
    static async run(info: ChatCompletionRequestMessageFunctionCall) {
        const function_name = info.name;
        const function_args = JSON.parse(info.arguments as string);
        let result = { message: 'ok', data: '' as any };
        console.log(`${yellow('function call')} : ${green(function_name)}(`, function_args, green(')'));
        if (function_name === 'run') {
        } else {
            result.message = 'unknown function';
        }
        console.log(`${yellow('function result')} : ${blue(result.message)} `);
        return result;
    }
}