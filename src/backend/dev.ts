import * as esbuild from 'esbuild';
import * as http from "http";
import {createSocketBackend} from "./signal";

const HTTP_HOST = "127.0.0.1";
const PORT_ESBUILD = 8000;
const PORT_HTTP = 8080;

esbuild.context({
    target: "es2022",
    entryPoints: ['src/frontend/index.ts'],
    outdir: "public/js",
    bundle: true,
    sourcemap: true,
}).then(async ctx => {
    const { host, port } = await ctx.serve({
        host: HTTP_HOST,
        port: PORT_ESBUILD,
        servedir: "public"
    })
})

const server = http.createServer();
server.on('request', (req, res) => {
    var connector = http.request({
        host: HTTP_HOST,
        port: PORT_ESBUILD,
        path: req.url,
        method: req.method,
        headers: req.headers
    }, (resp) => {
        resp.pipe(res);
    });

    req.pipe(connector);
});
server.listen(PORT_HTTP);

createSocketBackend(server);