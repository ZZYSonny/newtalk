import * as esbuild from 'esbuild';
import * as http from "http";
import express from 'express';
import { esbuildReloadPlugin, io } from "./signal";

const devMode = process.argv.includes("dev");


(async () => {
    const ctx = await esbuild.context({
        plugins: devMode? []: [esbuildReloadPlugin],
        target: "es2022",
        entryPoints: [
            'src/frontend/main.ts',
            'src/speedtest/main.ts'
        ],
        outdir: "public/js",
        bundle: true,
        sourcemap: devMode ? "inline" : false,
        minify: devMode ? false : true,
        treeShaking: devMode? false: true
    });

    if (devMode) {
        const { host, port } = await ctx.serve({
            host: "127.0.0.1",
            port: 8000,
            servedir: "public"
        })

        const server = http.createServer().listen(8080, "127.0.0.1");
        server.on('request', (req, res) => {
            var connector = http.request({
                host: host,
                port: port,
                path: req.url,
                method: req.method,
                headers: req.headers
            }, (resp) => {
                resp.pipe(res);
            });
            req.pipe(connector);
        });
        io.listen(server);
    } else {
        await ctx.rebuild();
        await ctx.watch();
        
        const app = express();
        app.use(express.static("public"));
        const server = http.createServer(app).listen(8080, "127.0.0.1");
        io.listen(server);
    }
})()