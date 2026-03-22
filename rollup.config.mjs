import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";
import json from '@rollup/plugin-json';

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.zstefanovic.steamscroll.sdPlugin";

function sourcemapPathTransform(relativeSourcePath, sourcemapPath) {
	return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
}

function basePlugins({ browser }) {
	return [
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		nodeResolve({
			browser,
			exportConditions: [browser ? "browser" : "node"],
			preferBuiltins: !browser
		}),
		commonjs(),
		json()
	];
}

const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
				this.addWatchFile(`${sdPlugin}/ui/settings.html`);
			},
		},
		...basePlugins({ browser: false }),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		}
	]
};

export default config;
