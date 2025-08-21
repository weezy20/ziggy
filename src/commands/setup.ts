import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ZigInstaller, log } from '../index';
import { colors } from '../utils/colors';
import * as clack from '@clack/prompts';
/**
 * Setup command - automatically configure shell environment
 */
export async function setupCommand(): Promise<void> {
  const installer = new ZigInstaller();
  
  log(colors.cyan('🔧 Ziggy Environment Setup'));
  log();

  if (installer.platform === 'windows') {
    // Windows PowerShell setup - get the actual $PROFILE path
    let profilePath: string;
    try {
      const profileResult = Bun.spawnSync(['powershell', '-Command', '$PROFILE'], {
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      if (profileResult.exitCode === 0) {
        profilePath = profileResult.stdout.toString().trim();
      } else {
        // Fallback to Windows PowerShell 5.x path
        profilePath = process.env.USERPROFILE + '\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1';
      }
    } catch (error) {
      // Fallback to Windows PowerShell 5.x path
      profilePath = process.env.USERPROFILE + '\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1';
    }
    
    const envLine = `. "${installer.envPath}"`;
    
    log(colors.yellow('Setting up PowerShell environment...'));
    log(colors.gray(`Profile: ${profilePath}`));
    log(colors.gray(`Adding: ${envLine}`));
    
    const confirm = await clack.confirm({
      message: 'Add Ziggy to your PowerShell profile?',
      initialValue: true
    });
    
    if (clack.isCancel(confirm) || !confirm) {
      log(colors.yellow('Setup cancelled.'));
      return;
    }
    
    try {
      // Create profile directory if it doesn't exist
      const profileDir = dirname(profilePath);
      if (!existsSync(profileDir)) {
        mkdirSync(profileDir, { recursive: true });
      }
      
      // Check if line already exists
      if (existsSync(profilePath)) {
        const content = require('fs').readFileSync(profilePath, 'utf8');
        if (content.includes(installer.envPath)) {
          log(colors.green('✓ Ziggy is already configured in your PowerShell profile'));
          return;
        }
      }
      
      // Add the line with a comment
      appendFileSync(profilePath, `\n# Added by Ziggy\n${envLine}\n`);
      
      log(colors.green('✅ Successfully added Ziggy to PowerShell profile!'));
      log(colors.yellow('\n🔄 Please restart PowerShell or run:'));
      log(colors.cyan(`. "${installer.envPath}"`));
      
    } catch (error) {
      console.error(colors.red('❌ Failed to setup profile:'), error);
      log(colors.yellow('\n📝 Manual setup required:'));
      log(colors.cyan(`Add-Content $PROFILE '${envLine}'`));
    }
    
  } else {
    // Unix-like systems
    log(colors.yellow('Setting up shell environment...'));
    
    // Detect current shell
    const currentShell = process.env.SHELL?.split('/').pop() || 'bash';
    
    const shellConfigs = [
      { name: 'Bash', file: '~/.bashrc', actualFile: process.env.HOME + '/.bashrc', shell: 'bash' },
      { name: 'Zsh', file: '~/.zshrc', actualFile: process.env.HOME + '/.zshrc', shell: 'zsh' },
      { name: 'Fish', file: '~/.config/fish/config.fish', actualFile: process.env.HOME + '/.config/fish/config.fish', shell: 'fish' }
    ];
    
    // Find the current shell config
    let defaultConfig = shellConfigs.find(s => s.shell === currentShell) || shellConfigs[0];
    
    // Offer automatic setup
    const choices = [
      { value: 'auto', label: `Automatically add to ${defaultConfig!.name} profile (${defaultConfig!.file})` },
      { value: 'manual', label: 'Show manual setup instructions' },
      { value: 'custom', label: 'Choose a different shell profile' }
    ];
    
    const setupChoice = await clack.select({
      message: 'How would you like to setup your shell environment?',
      options: choices,
      initialValue: 'auto'
    });
    
    if (clack.isCancel(setupChoice)) {
      log(colors.yellow('Setup cancelled.'));
      return;
    }
    
    if (setupChoice === 'custom') {
      // Let user choose shell
      const shellChoices = shellConfigs.map(s => ({
        value: s.actualFile,
        label: `${s.name} (${s.file})`
      }));
      
      const selectedShell = await clack.select({
        message: 'Select your shell profile:',
        options: shellChoices,
        initialValue: defaultConfig!.actualFile
      });
      
      if (clack.isCancel(selectedShell)) {
        log(colors.yellow('Setup cancelled.'));
        return;
      }
      
      defaultConfig = shellConfigs.find(s => s.actualFile === selectedShell) || defaultConfig;
    }
    
    if (setupChoice === 'auto' || setupChoice === 'custom') {
      // Automatic setup
      const envLine = `source "${installer.envPath}"`;
      const profilePath = defaultConfig!.actualFile;
      const profileName = defaultConfig!.file;
      
      log(colors.gray(`Profile: ${profileName}`));
      log(colors.gray(`Adding this line -> ${envLine}`));
      
      const confirm = await clack.confirm({
        message: `Add Ziggy to your ${defaultConfig!.name} profile?`,
        initialValue: true
      });
      
      if (clack.isCancel(confirm) || !confirm) {
        log(colors.yellow('Setup cancelled.'));
        return;
      }
      
      try {
        // Create profile directory if it doesn't exist (for fish)
        const profileDir = dirname(profilePath);
        if (!existsSync(profileDir)) {
          mkdirSync(profileDir, { recursive: true });
        }
        
        // Check if line already exists
        if (existsSync(profilePath)) {
          const content = require('fs').readFileSync(profilePath, 'utf8');
          if (content.includes(installer.envPath)) {
            log(colors.green(`✓ Ziggy is already configured in your ${defaultConfig!.name} profile`));
            return;
          }
        }
        
        // Add the line with a comment
        appendFileSync(profilePath, `\n# Added by Ziggy\n${envLine}\n`);
        
        log(colors.green(`✅ Successfully added Ziggy to ${defaultConfig!.name} profile!`));
        log(colors.yellow(`\n🔄 To start using Ziggy immediately, run:`));
        log(colors.cyan(`source ${profileName}`));
        log(colors.yellow('Or restart your terminal.'));
        
      } catch (error) {
        console.error(colors.red('❌ Failed to setup profile:'), error);
        log(colors.yellow('\n📝 Manual setup required:'));
        log(colors.cyan(`echo '${envLine}' >> ${profileName}`));
      }
      
    } else {
      // Manual setup instructions
      log(colors.cyan('Add one of these lines to your shell profile:'));
      for (const shell of shellConfigs) {
        const envLine = `source "${installer.envPath}"`;
        log(colors.green(`• ${shell.name} (${shell.file}): ${envLine}`));
      }
      log(colors.yellow('\nAfter adding the line, restart your terminal or run:'));
      log(colors.cyan(`source <your-profile-file>`));
    }
  }
}