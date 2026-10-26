import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(root, '.runtime');
const officialUrl = 'https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip';

function archiveFiles(data) {
  if (data.length < 1000000 || data[0] !== 80 || data[1] !== 75) throw new Error('The download is not a valid OpenSCAD ZIP.');
  const files = unzipSync(data);
  for (const name of Object.keys(files)) {
    const destination = resolve(runtime, name);
    if (!destination.startsWith(runtime + sep)) throw new Error('Unexpected archive path.');
  }
  if (!files['openscad-2021.01/openscad.com']?.length) throw new Error('The ZIP does not contain the expected OpenSCAD executable.');
  return files;
}

async function downloadWindows(destination) {
  // Use Windows' network/proxy handling. URL and path are data, never shell code.
  const command = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $env:SCADLATCH_SETUP_DOWNLOAD_URL -OutFile $env:SCADLATCH_SETUP_DOWNLOAD_PATH -TimeoutSec 300 -ErrorAction Stop
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}`;
  await new Promise((resolveDownload, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, SCADLATCH_SETUP_DOWNLOAD_URL: officialUrl, SCADLATCH_SETUP_DOWNLOAD_PATH: destination },
    });
    let timedOut = false;
    let stderr = '';
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 310000);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.once('error', error => { clearTimeout(timer); reject(new Error(`Could not start the Windows downloader: ${error.message}`)); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('The official download timed out after five minutes.'));
      else if (code !== 0) reject(new Error(`Windows download failed (${signal || `exit ${code}`}): ${stderr.trim() || 'No error details were returned.'}`));
      else resolveDownload();
    });
  });
}

async function installPortable() {
  const archive = resolve(runtime, 'openscad.zip');
  let files;
  try {
    const data = await readFile(archive);
    try { files = archiveFiles(data); }
    catch {
      console.log('The cached ZIP is incomplete or invalid; downloading it again.');
      await rm(archive, { force: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!files) {
    const partial = resolve(runtime, `openscad.zip.part-${process.pid}`);
    console.log('Downloading the official OpenSCAD 2021.01 portable build (22 MB) using Windows networking…');
    try {
      await downloadWindows(partial);
      files = archiveFiles(await readFile(partial));
      // Only a complete, readable ZIP becomes the reusable cache.
      await rename(partial, archive);
    } finally {
      await rm(partial, { force: true });
    }
  } else {
    console.log('Using the cached official OpenSCAD portable ZIP.');
  }

  console.log('Extracting the official portable build…');
  for (const [name, bytes] of Object.entries(files)) {
    const destination = resolve(runtime, name);
    if (!destination.startsWith(runtime + sep)) throw new Error('Unexpected archive path.');
    if (name.endsWith('/')) await mkdir(destination, { recursive: true });
    else { await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
  }
  const executable = resolve(runtime, 'openscad-2021.01/openscad.com');
  await access(executable);
  return executable;
}

try {
  await mkdir(runtime, { recursive: true });
  const candidates = [process.env.OPENSCAD_BIN, process.platform === 'win32' ? 'openscad.com' : 'openscad',
    ...(process.platform === 'win32' ? ['C:\\Program Files\\OpenSCAD\\openscad.com', resolve(runtime, 'openscad-2021.01/openscad.com')] : []),
    ...(process.platform === 'darwin' ? ['/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD'] : [])].filter(Boolean);
  let executable = candidates.find(bin => spawnSync(bin, ['--version'], { windowsHide: true, timeout: 10000 }).status === 0);
  if (!executable && process.platform === 'win32') executable = await installPortable();
  if (!executable) throw new Error('No working OpenSCAD executable was found.');

  const check = spawnSync(executable, ['--version'], { windowsHide: true, encoding: 'utf8', timeout: 10000 });
  if (check.status !== 0) throw new Error(check.error?.message || check.stderr?.trim() || 'OpenSCAD did not start.');
  await writeFile(resolve(runtime, 'config.json'), JSON.stringify({ executable }, null, 2));
  console.log((check.stdout + check.stderr).trim());
  console.log('Ready. Run npm run dev and open http://127.0.0.1:4173');
} catch (error) {
  console.error(`Setup could not finish: ${error.message || String(error)}`);
  console.error('Install OpenSCAD from https://openscad.org/downloads.html, then run npm run setup again.');
  if (process.platform === 'win32') {
    console.error(`Official Windows portable ZIP: ${officialUrl}`);
    console.error('Extract it, then set OPENSCAD_BIN to its openscad.com file. In PowerShell, for example:');
    console.error('$env:OPENSCAD_BIN = "C:\\tools\\openscad-2021.01\\openscad.com"');
  } else {
    console.error('Linux: install your distribution’s openscad package. macOS: install the official application.');
    console.error('For a custom location, set OPENSCAD_BIN to the executable path.');
  }
  process.exitCode = 1;
}
