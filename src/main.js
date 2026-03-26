/**
 * SHELBOX - Decentralized File Storage
 * Wallet: Aptos Wallet Adapter Core with Petra integration
 * Storage: @shelby-protocol/sdk via shelby.js
 */

// 🔥 IMPORT BUFFER DULU - PALING ATAS
import { Buffer } from 'buffer';
window.Buffer = Buffer;
globalThis.Buffer = Buffer; // 🔥 JUGA SET KE GLOBALTHIS

import { WalletCore } from '@aptos-labs/wallet-adapter-core';
import { uploadToShelby, downloadFromShelby, SHELBY_CONFIG, getBalance } from './shelby.js';

// ── STATE ────────────────────────────────────────────
let conn = false, files = [], flt = 'all', sel = [];
let walletAddress = null, walletAccount = null, walletCore = null;
let isWalletCoreInitialized = false;

// ── BOOT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await initWalletCore();
  log('SHELBOX · Ready · Wallet Adapter Core loaded', 'ok');
});

// ── WALLET CORE INIT ─────────────────────────────────
async function initWalletCore() {
  try {
    console.log('🔧 Initializing Aptos Wallet Adapter Core with Shelbynet...');

    // Define Shelbynet network configuration
    const shelbynet = {
      name: 'Shelbynet',
      chainId: 'shelbynet',
      url: 'https://api.shelbynet.shelby.xyz/v1',
      faucetUrl: 'https://faucet.shelbynet.shelby.xyz'
    };

    // Initialize WalletCore with Shelbynet network
    walletCore = new WalletCore(
      ["Petra", "Martian"], // Supported wallets
      [shelbynet], // Custom networks - Shelbynet
      {
        onError: (err) => {
          console.error('WalletCore error:', err);
          log('WALLET_ERR · ' + (err?.message || err), 'er');
        },
        autoConnect: false, // Don't auto-connect on init
        defaultNetwork: shelbynet.name // Set Shelbynet as default
      }
    );

    // Wait for wallets to be registered
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ WalletCore initialized with Shelbynet');
    console.log('📋 Available wallets:', walletCore.wallets.map(w => w.name));
    console.log('🌐 Available networks:', walletCore.networks.map(n => n.name));
    
    isWalletCoreInitialized = true;
    window.__walletCore = walletCore;
    
    // Set up event listeners
    setupWalletEventListeners();
    
    // Auto-switch to Shelbynet if possible
    await switchToShelbynet();
    
    log('WALLET_CORE · Initialized with Shelbynet and ' + walletCore.wallets.length + ' wallets', 'ok');
    
  } catch (error) {
    console.error('❌ WalletCore initialization failed:', error);
    log('WALLET_CORE_INIT_FAILED · ' + error.message, 'er');
  }
}

// ── SWITCH TO SHELBYNET ───────────────────────────────
async function switchToShelbynet() {
  try {
    if (!walletCore) return;
    
    console.log('🔄 Switching to Shelbynet...');
    
    // Try to switch network to Shelbynet
    const shelbynet = walletCore.networks.find(n => n.name === 'Shelbynet');
    if (shelbynet) {
      await walletCore.switchNetwork('Shelbynet');
      console.log('✅ Switched to Shelbynet');
      log('NETWORK · Switched to Shelbynet', 'ok');
    } else {
      console.warn('⚠️ Shelbynet not found in available networks');
      log('NETWORK · Shelbynet not available', 'in');
    }
  } catch (error) {
    console.warn('⚠️ Could not switch to Shelbynet:', error);
    log('NETWORK_SWITCH_FAILED · ' + error.message, 'in');
  }
}

// ── WALLET EVENT LISTENERS ───────────────────────────
function setupWalletEventListeners() {
  if (!walletCore) return;

  walletCore.on('connect', async (account) => {
    try {
      console.log('✅ Wallet connected:', account);
      walletAccount = account;
      walletAddress = account.address.toString();
      conn = true;
      
      await onWalletConnected(walletAddress);
      closeModal();
      log('WALLET_CONNECTED · ' + walletAddress.slice(0, 10) + '...', 'ok');
    } catch (error) {
      console.error('❌ Connect handler error:', error);
      log('CONNECT_HANDLER_ERROR · ' + error.message, 'er');
    }
  });

  walletCore.on('disconnect', () => {
    try {
      console.log('🔌 Wallet disconnected');
      conn = false;
      walletAddress = null;
      walletAccount = null;
      onWalletDisconnected();
      log('WALLET_DISCONNECTED', 'in');
    } catch (error) {
      console.error('❌ Disconnect handler error:', error);
    }
  });

  walletCore.on('accountChange', async (account) => {
    try {
      console.log('🔄 Account changed:', account);
      if (account) {
        walletAccount = account;
        walletAddress = account.address.toString();
        await onWalletConnected(walletAddress);
        log('ACCOUNT_CHANGED · ' + walletAddress.slice(0, 10) + '...', 'in');
      }
    } catch (error) {
      console.error('❌ Account change handler error:', error);
    }
  });
}

// ── WALLET DETECTION ───────────────────────────────────
export function detectWallets() {
  if (!isWalletCoreInitialized || !walletCore) {
    return [];
  }
  
  const wallets = walletCore.wallets.map(w => ({
    name: w.name,
    available: true,
    ready: w.readyState === 'Installed'
  }));
  
  console.log('Available wallets:', wallets);
  return wallets;
}

// ── CONNECT WALLET ─────────────────────────────────────
export async function connectWallet(walletName = 'Petra') {
  if (!isWalletCoreInitialized || !walletCore) {
    toast('❌ Wallet adapter not initialized', 'er');
    log('WALLET_NOT_INITIALIZED', 'er');
    return;
  }

  try {
    log('CONNECT · Connecting to ' + walletName + ' on Shelbynet...', 'in');
    
    // Find the wallet
    const wallet = walletCore.wallets.find(w => w.name === walletName);
    
    if (!wallet) {
      toast('❌ ' + walletName + ' wallet not found', 'er');
      log('WALLET_NOT_FOUND · ' + walletName, 'er');
      return;
    }

    if (wallet.readyState !== 'Installed') {
      toast('❌ ' + walletName + ' wallet not installed', 'er');
      log('WALLET_NOT_INSTALLED · ' + walletName, 'er');
      // Provide installation link
      if (walletName === 'Petra') {
        toast('💡 Install Petra: https://petra.app', 'in');
      } else if (walletName === 'Martian') {
        toast('💡 Install Martian: https://www.martianwallet.xyz/', 'in');
      }
      return;
    }

    // Check if wallet is on correct network
    const currentNetwork = walletCore.network;
    if (currentNetwork?.name !== 'Shelbynet') {
      log('NETWORK · Switching to Shelbynet before connection...', 'in');
      await switchToShelbynet();
    }

    // Connect to the wallet
    console.log('🔗 Connecting to ' + walletName + '...');
    await walletCore.connect(walletName);
    
  } catch (error) {
    console.error('❌ Wallet connection error:', error);
    
    const msg = error?.message || '';
    if (error?.code === 4001 || /cancel|reject|denied|user/i.test(msg)) {
      toast('❌ Connection cancelled', 'er');
      log('CONNECT_CANCELLED', 'er');
    } else if (error?.message?.includes('network')) {
      toast('❌ Network error. Make sure Petra is on Shelbynet', 'er');
      log('NETWORK_ERROR · ' + msg, 'er');
      // Show network setup instructions
      setTimeout(() => {
        toast('💡 Setup Shelbynet in Petra: Settings → Network → Add Custom', 'in');
      }, 2000);
    } else {
      toast('❌ ' + msg, 'er');
      log('CONNECT_ERROR · ' + msg, 'er');
    }
  }
}

// ── DISCONNECT WALLET ─────────────────────────────────
export async function disconnectWallet() {
  if (!walletCore) return;
  
  try {
    await walletCore.disconnect();
    log('WALLET_DISCONNECTED', 'ok');
  } catch (error) {
    console.error('❌ Disconnect error:', error);
    log('DISCONNECT_ERROR · ' + error.message, 'er');
  }
}

// ── GET WALLET ACCOUNT ────────────────────────────────
export function getWalletAccount() {
  return walletAccount;
}

// ── IS WALLET CONNECTED ────────────────────────────────
export function isWalletConnected() {
  return conn && walletAddress !== null;
}

// ── ON WALLET CONNECTED ─────────────────────────────────
async function onWalletConnected(address) {
  try {
    console.log('🎯 onWalletConnected called with:', address);
    
    conn = true;
    walletAddress = address;

    log('CONNECTED · ' + address.slice(0, 14) + '...', 'ok');

    // Update UI
    const walletStatus = document.getElementById('ws');
    if (walletStatus) {
      walletStatus.textContent = address.slice(0, 6) + '...' + address.slice(-4);
    }

    // Update network status
    const networkStatus = document.getElementById('network-status');
    if (networkStatus) {
      const currentNetwork = walletCore?.network;
      if (currentNetwork) {
        networkStatus.textContent = currentNetwork.name;
        networkStatus.style.color = currentNetwork.name === 'Shelbynet' ? 'var(--success)' : 'var(--warning)';
      } else {
        networkStatus.textContent = 'Unknown';
        networkStatus.style.color = 'var(--error)';
      }
    }

    // Update wallet button
    const walletBtn = document.getElementById('walletBtn');
    if (walletBtn) {
      walletBtn.textContent = '🔗 ' + address.slice(0, 6) + '...';
    }

    // Get balance
    try {
      const balance = await getBalance(address);
      const aptEl = document.getElementById('apt');
      const usdEl = document.getElementById('usd');
      
      if (aptEl && balance.apt) {
        aptEl.textContent = parseFloat(balance.apt).toFixed(4);
      }
      if (usdEl && balance.usd) {
        usdEl.textContent = parseFloat(balance.usd).toFixed(2);
      }
    } catch (balanceErr) {
      console.error('Balance fetch error:', balanceErr);
    }

    // Load files
    await loadFiles();
    
  } catch (error) {
    console.error('❌ onWalletConnected error:', error);
    log('ON_CONNECTED_ERROR · ' + error.message, 'er');
  }
}

// ── ON WALLET DISCONNECTED ───────────────────────────────
function onWalletDisconnected() {
  conn = false;
  walletAddress = null;
  walletAccount = null;

  // Update UI
  const walletStatus = document.getElementById('ws');
  if (walletStatus) {
    walletStatus.textContent = '—';
  }

  const walletBtn = document.getElementById('walletBtn');
  if (walletBtn) {
    walletBtn.textContent = '🔗 Connect Wallet';
  }

  // Clear balance
  const aptEl = document.getElementById('apt');
  const usdEl = document.getElementById('usd');
  if (aptEl) aptEl.textContent = '0';
  if (usdEl) usdEl.textContent = '0';

  // Clear files
  const fileList = document.getElementById('fileList');
  if (fileList) fileList.innerHTML = '';
  
  files = [];
}

// ── FILE OPERATIONS ────────────────────────────────────
async function loadFiles() {
  if (!walletAddress) return;
  
  try {
    // This would integrate with the shelby.js file operations
    console.log('Loading files for address:', walletAddress);
    // TODO: Implement file loading from Shelby protocol
  } catch (error) {
    console.error('Load files error:', error);
  }
}

// ── LOGGING ─────────────────────────────────────────────
function log(msg, type = 'in') {
  console.log('[' + type.toUpperCase() + '] ' + msg);
  // TODO: Update UI log display if needed
}

// ── TOAST NOTIFICATIONS ────────────────────────────────
function toast(msg, type = 'ok') {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === 'ok' ? 'var(--success)' : 'var(--error)'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

// ── MODAL FUNCTIONS ─────────────────────────────────────
export function openModal() {
  if (conn) { 
    // If already connected, show disconnect modal
    toast('Already connected', 'ok');
    return; 
  }
  
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.add('on');
  
  // Update wallet status
  updateWalletStatus();
}

export function closeModal() {
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.remove('on');
}

// Update wallet status in modal
function updateWalletStatus() {
  const petraStatus = document.getElementById('petra-status');
  const martianStatus = document.getElementById('martian-status');
  
  if (!isWalletCoreInitialized || !walletCore) {
    if (petraStatus) {
      petraStatus.textContent = 'Initializing...';
      petraStatus.style.color = 'var(--text-muted)';
    }
    if (martianStatus) {
      martianStatus.textContent = 'Initializing...';
      martianStatus.style.color = 'var(--text-muted)';
    }
    return;
  }
  
  const wallets = walletCore.wallets;
  const petra = wallets.find(w => w.name === 'Petra');
  const martian = wallets.find(w => w.name === 'Martian');
  
  if (petraStatus) {
    if (petra && petra.readyState === 'Installed') {
      petraStatus.textContent = 'Available';
      petraStatus.style.color = 'var(--success)';
    } else {
      petraStatus.textContent = 'Not detected';
      petraStatus.style.color = 'var(--text-muted)';
    }
  }
  
  if (martianStatus) {
    if (martian && martian.readyState === 'Installed') {
      martianStatus.textContent = 'Available';
      martianStatus.style.color = 'var(--success)';
    } else {
      martianStatus.textContent = 'Not detected';
      martianStatus.style.color = 'var(--text-muted)';
    }
  }
}

// ── UI INITIALIZATION ───────────────────────────────────
function initUI() {
  // Set up modal backdrop click
  document.getElementById('walletModal')?.addEventListener('click', e => {
    if (e.target.id === 'walletModal') closeModal();
  });

  // Set up navigation
  document.querySelectorAll('.ni').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href?.startsWith('#')) {
        e.preventDefault();
        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
        document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
        a.classList.add('on');
      }
    });
  });

  // Expose all functions to window._sx for HTML onclick handlers
  window._sx = {
    openModal,
    closeModal,
    connectWallet,
    disconnectWallet,
    detectWallets,
    getWalletAccount,
    isWalletConnected,
    onSel: handleFileSelection,
    doUp: handleUpload,
    filt: handleFilter,
    dl: handleDownload,
    del: handleDelete,
    pwipe: handleWipe,
    claimFaucet: handleClaimFaucet,
    clrLog: clearLog,
    switchTab: handleSwitchTab,
  };
}

// ── FILE HANDLERS ───────────────────────────────────────
export function handleFileSelection(input) {
  sel = Array.from(input.files);
  const selPill = document.getElementById('sp');
  const sn = document.getElementById('sn');
  
  if (sel.length > 0) {
    if (selPill) selPill.style.display = 'inline-block';
    if (sn) sn.textContent = sel.length + ' file(s) selected';
  } else {
    if (selPill) selPill.style.display = 'none';
  }
}

export async function handleUpload() {
  if (!conn) {
    toast('❌ Please connect wallet first', 'er');
    openModal();
    return;
  }
  
  if (sel.length === 0) {
    toast('❌ Please select files first', 'er');
    return;
  }
  
  try {
    // TODO: Implement file upload using shelby.js
    toast('📤 Uploading files...', 'ok');
    console.log('Uploading files:', sel);
  } catch (error) {
    toast('❌ Upload failed: ' + error.message, 'er');
  }
}

// ── PLACEHOLDER FUNCTIONS ───────────────────────────────
export function handleFilter(filter) { console.log('Filter:', filter); }
export function handleDownload(fileId) { console.log('Download:', fileId); }
export function handleDelete(fileId) { console.log('Delete:', fileId); }
export function handleWipe() { console.log('Wipe all files'); }
export function handleClaimFaucet() { console.log('Claim faucet'); }
export function clearLog() { console.log('Clear log'); }
export function handleSwitchTab(tab, type) { 
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  console.log('Switch to:', type); 
}
