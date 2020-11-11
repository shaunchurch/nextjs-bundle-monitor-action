const fs = require("fs");
const zlib = require("zlib");
const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const path = require("path");

function log(...args) {
  console.log(...args);
}

function loadBuildManifest() {
  let buildManifest;
  try {
    // const matchersPath = path.join(__dirname);
    const workspace = core.getInput("workspace");
    buildManifest = require(workspace + "/.next/build-manifest.json");
    return buildManifest;
  } catch (e) {
    if (!buildManifest) {
      throw new Error(
        "No build manifest found at `.next/build-manifest.json`. Try `npm install && npm run build`."
      );
    }
  }
}

function loadServerlessPagesManifest() {
  let pagesManifest;
  try {
    pagesManifest = require(".next/serverless/pages-manifest.json");
    return pagesManifest;
  } catch (e) {
    if (!pagesManifest) {
      throw new Error(
        "No pages manifest found at `.next/serverless/pages-manifest.json`. Try `npm install && npm run build`."
      );
    }
  }
}

function parseBuildManifest(buildManifest) {
  return Object.keys(buildManifest.pages).reduce((acc, page) => {
    return { ...acc, [page]: buildManifest.pages[page].map(sizeBundle) };
  }, {});
}

function parseServerlessPagesManifest(serverlessPagesManifest) {
  return Object.keys(serverlessPagesManifest).reduce((acc, page) => {
    return {
      ...acc,
      [page]: sizeBundle("serverless/" + serverlessPagesManifest[page]),
    };
  }, {});
}

async function gzipFile(filename) {
  return new Promise((resolve, reject) => {
    const fileContents = fs.createReadStream("../.next/" + filename);
    const writeStream = fs.createWriteStream("../.next/" + filename + ".gz");
    const zip = zlib.createGzip();
    fileContents
      .pipe(zip)
      .pipe(writeStream)
      .on("finish", (err) => {
        if (err) return reject(err);
        resolve();
      });
  });
}

async function sizeBundle(bundle) {
  try {
    const bundlePath = "../.next/" + bundle;
    const fileStats = fs.statSync(bundlePath);
    const gzippedFile = await gzipFile(bundlePath);
    const gzippedFileStats = fs.statSync(bundlePath + ".gz");
    const sizedBundle = {
      file: bundle,
      fileSize: parseFloat((fileStats.size / 1024).toFixed(2), 10),
      gzippedFileSize: parseFloat(
        (gzippedFileStats.size / 1024).toFixed(2),
        10
      ),
    };

    return sizedBundle;
  } catch (e) {
    console.log(e);
    throw new Error("Could not find filesize.");
  }
}

async function main() {
  const token = core.getInput("token");
  log("Initializing github...", token);
  const octokit = new github.getOctokit(token);
  log("Okto. " + token);

  const installCommand = core.getInput("install_command");
  const buildCommand = core.getInput("build_command");
  const distPath = core.getInput("dist_path");

  log("Installing dependencies...");
  await exec.exec(installCommand);
  log("Building project...");

  // const buildManifestPath = path.join(__dirname, ".next");

  await exec.exec(buildCommand);
  await exec.exec("ls -lat");
  await exec.exec("pwd");
  await exec.exec("ls .next");
  // await exec.exec("ls " + buildManifestPath);

  core.setOutput("Build complete.");

  log("Loading build manifest...");
  const buildManifest = loadBuildManifest();
  log("Loading serverless pages manifest...");
  const serverlessPagesManifest = loadServerlessPagesManifest();
  log("Checking file sizes...");
  const pages = parseBuildManifest(buildManifest);
  const serverlessPages = parseServerlessPagesManifest(serverlessPagesManifest);

  Object.keys(pages).forEach(async (page) => {
    const resolvedFiles = await Promise.all(pages[page]);

    let pageSizeTotal = 0;
    let pageSizeTotalGzipped = 0;
    resolvedFiles.forEach((file) => {
      log(file.file, file.fileSize, file.gzippedFileSize);
      pageSizeTotal = pageSizeTotal + file.fileSize;
      pageSizeTotalGzipped = pageSizeTotalGzipped + file.gzippedFileSize;
    });
    log(page, pageSizeTotal.toFixed(2), pageSizeTotalGzipped.toFixed(2));
  });
}

// function totalFilesize(bundles) {
//   return bundles.reduce(
//     (accumulator, current) => accumulator + current.fileSize,
//     0
//   );
// }

main();
