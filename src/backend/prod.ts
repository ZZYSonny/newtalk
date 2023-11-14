import * as esbuild from 'esbuild';
import * as http from "http";
import * as fs from 'fs';
import express from 'express';
import {createSocketBackend} from "./signal";

const HTTP_HOST = "127.0.0.1";
const PORT_HTTP = 8080;
const SERVE_DIR = "public"

esbuild.context({
    target: "es2022",
    entryPoints: [
        'src/frontend/call.ts',
        'src/frontend/test.ts'
    ],
    outdir: "public/js",
    bundle: true,
    minify: true,
    treeShaking: true
}).then(async (ctx) => {
    await ctx.rebuild()
    ctx.watch()
})

const app = express();
app.use(express.static(SERVE_DIR));

const server = http.createServer(app);
server.listen(PORT_HTTP, HTTP_HOST);



createSocketBackend(server);