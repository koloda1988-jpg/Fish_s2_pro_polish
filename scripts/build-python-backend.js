const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const backendScript = path.join(root, 'python_backend.py');
const distDir = path.join(root, 'backend-dist');
const buildDir = path.join(root, 'backend-build');
const specDir = path.join(root, 'backend-spec');
const backendExe = path.join(distDir, process.platform === 'win32' ? 'python_backend.exe' : 'python_backend');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

function pythonCmd() {
  if (process.platform === 'win32') {
    return { cmd: 'py', prefix: ['-3'] };
  }
  return { cmd: 'python3', prefix: [] };
}

function ensurePyInstaller(py) {
  try {
    run(py.cmd, [...py.prefix, '-m', 'PyInstaller', '--version']);
  } catch (_) {
    console.log('[build-backend] Installing pyinstaller...');
    run(py.cmd, [...py.prefix, '-m', 'pip', 'install', '--upgrade', 'pyinstaller']);
  }
  // aiohttp dla server-pipeline (server_pipeline.py)
  try {
    run(py.cmd, [...py.prefix, '-c', 'import aiohttp']);
  } catch (_) {
    console.log('[build-backend] Installing aiohttp...');
    run(py.cmd, [...py.prefix, '-m', 'pip', 'install', 'aiohttp']);
  }
}

function cleanDirs() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.rmSync(specDir, { recursive: true, force: true });
}

function buildBackend(py) {
  const dataSeparator = process.platform === 'win32' ? ';' : ':';
  const mapPath = path.join(root, 'phonetic_map.json');
  const dataArg = `${mapPath}${dataSeparator}.`;
  const pipelinePath = path.join(root, 'server_pipeline.py');
  const pipelineArg = `${pipelinePath}${dataSeparator}.`;
  const args = [
    ...py.prefix,
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onefile',
    '--name',
    'python_backend',
    '--distpath',
    distDir,
    '--workpath',
    buildDir,
    '--specpath',
    specDir,
    '--add-data',
    dataArg,
    '--add-data',
    pipelineArg,
    '--hidden-import',
    'aiohttp',
    '--hidden-import',
    'server_pipeline',
    backendScript,
  ];
  run(py.cmd, args);
}

function main() {
  if (!fs.existsSync(backendScript)) {
    throw new Error(`Missing backend script: ${backendScript}`);
  }

  const py = pythonCmd();
  console.log('[build-backend] Using Python launcher:', py.cmd, py.prefix.join(' '));

  cleanDirs();
  ensurePyInstaller(py);
  buildBackend(py);

  if (!fs.existsSync(backendExe)) {
    throw new Error(`Expected backend executable not found: ${backendExe}`);
  }

  console.log('[build-backend] OK:', backendExe);
}

main();
