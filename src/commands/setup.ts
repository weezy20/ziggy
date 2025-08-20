import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ZigInstaller } from '../index';
import { colors } from '../utils/colors';
import * as clack from '@clack/prompts';

/**
 * Setup command - automatically configure shell environment
 */
export async function setupCommand(): Promise<void> {
  const installer = new ZigInstaller();
  
  console.log(colors.cyan('🔧 Ziggy Environment Setup'));
  console.log();

  if (installer.platform === 'windows') {
    // Windows PowerShell setup
    const profilePath = process.env.USERPROFILE + '\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1';
    const envLine = `. "${installer.envPath}"`;
    
    console.log(colors.yellow('Setting up PowerShell environment...'));
    console.log(colors.gray(`Profile: ${profilePath}`));
    console.log(colors.gray(`Adding: ${envLine}`));
    
    const confirm = await clack.confirm({
      message: 'Add Ziggy to your PowerShell profile?',
      initialValue: true
    });
    
    if (clack.isCancel(confirm) || !confirm) {
      console.log(colors.yellow('Setup cancelled.'));
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
          console.log(colors.green('✓ Ziggy is already configured in your PowerShell profile'));
          return;
        }
      }
      
      // Add the line
      appendFileSync(profilePath, `\n${envLine}\n`);
      
      console.log(colors.green('✅ Successfully added Ziggy to PowerShell profile!'));
      console.log(colors.yellow('\n🔄 Please restart PowerShell or run:'));
      console.log(colors.cyan(`. "${installer.envPath}"`));
      
    } catch (error) {
      console.error(colors.red('❌ Failed to setup profile:'), error);
      console.log(colors.yellow('\n📝 Manual setup required:'));
      console.log(colors.cyan(`Add-Content $PROFILE '${envLine}'`));
    }
    
  } else {
    // Unix-like systems
    console.log(colors.yellow('Setting up shell environment...'));
    
    const shells = [
      { name: 'Bash', file: '~/.bashrc', line: `source "${installer.envPath}"` },
      { name: 'Zsh', file: '~/.zshrc', line: `source "${installer.envPath}"` },
      { name: 'Fish', file: '~/.config/fish/config.fish', line: `source "${installer.envPath}"` }
    ];
    
    console.log(colors.cyan('Add one of these lines to your shell profile:'));
    for (const shell of shells) {
      console.log(colors.green(`• ${shell.name} (${shell.file}): ${shell.line}`));
    }
  }
}