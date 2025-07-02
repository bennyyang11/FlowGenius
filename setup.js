#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔮 FlowGenius Setup Script');
console.log('==============================\n');

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = '16.0.0';

if (nodeVersion < `v${requiredVersion}`) {
  console.error(`❌ Error: Node.js version ${requiredVersion} or higher is required. You have ${nodeVersion}`);
  process.exit(1);
}

console.log(`✅ Node.js version: ${nodeVersion}`);

// Check if config.json exists
const configPath = path.join(__dirname, 'config.json');
const exampleConfigPath = path.join(__dirname, 'config.example.json');

if (!fs.existsSync(configPath)) {
  console.log('📋 Creating config.json from template...');
  
  if (fs.existsSync(exampleConfigPath)) {
    fs.copyFileSync(exampleConfigPath, configPath);
    console.log('✅ Config file created successfully');
    console.log('⚠️  Please edit config.json and add your OpenAI API key');
  } else {
    console.error('❌ Error: config.example.json not found');
    process.exit(1);
  }
} else {
  console.log('✅ Config file already exists');
}

// Check if dependencies are installed
const packageJsonPath = path.join(__dirname, 'package.json');
const nodeModulesPath = path.join(__dirname, 'node_modules');

if (!fs.existsSync(nodeModulesPath)) {
  console.log('📦 Installing dependencies...');
  
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully');
  } catch (error) {
    console.error('❌ Error installing dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Dependencies already installed');
}

// Create necessary directories
const directories = [
  'logs',
  'backups',
  'temp'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Check configuration
console.log('\n🔧 Configuration Check');
console.log('======================');

try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Check OpenAI API key
  if (config.api && config.api.openai && config.api.openai.apiKey) {
    if (config.api.openai.apiKey.includes('your_')) {
      console.log('⚠️  OpenAI API key needs to be configured');
      console.log('   Edit config.json and replace "your_openai_api_key_here" with your actual API key');
      console.log('   Get your API key from: https://platform.openai.com/api-keys');
    } else {
      console.log('✅ OpenAI API key configured');
    }
  } else {
    console.log('⚠️  OpenAI API configuration missing');
  }
  
  // Check auto-organization settings
  if (config.autoOrganization) {
    console.log(`✅ Auto-organization: ${config.autoOrganization.enabled ? 'enabled' : 'disabled'}`);
    console.log(`✅ Confidence threshold: ${config.autoOrganization.confidenceThreshold}`);
  }
  
} catch (error) {
  console.error('❌ Error reading config file:', error.message);
}

console.log('\n🚀 Setup Complete!');
console.log('==================');
console.log('');
console.log('Next steps:');
console.log('1. Edit config.json and add your OpenAI API key');
console.log('2. Run "npm start" to launch FlowGenius');
console.log('3. Start organizing your files with AI!');
console.log('');
console.log('Need help? Check the README.md file or visit:');
console.log('https://github.com/yourusername/flowgenius');
console.log('');
console.log('Happy organizing! 🎉');

// Validate package.json scripts
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.scripts || !packageJson.scripts.start) {
    console.log('⚠️  Warning: "start" script not found in package.json');
  }
  
  if (!packageJson.dependencies || !packageJson.dependencies.electron) {
    console.log('⚠️  Warning: Electron dependency not found');
  }
  
} catch (error) {
  console.error('❌ Error reading package.json:', error.message);
} 