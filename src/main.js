/**
 * SHELBOX - Decentralized File Storage (using working Sheltrix wallet connection)
 * Wallet: Petra (window.aptos / window.petra) + AIP-62 WalletCore fallback
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

// 🔥 EXPORT walletCore ke global supaya bisa diakses dari shelby.js
window.__walletCore = null;

// ── BOOT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await initWalletCore();
  log('SHELBOX · Ready · SDK v0.2.4 loaded', 'ok');
});

// ── WALLET CORE INIT ─────────────────────────────────
async function initWalletCore() {
  try {
    console.log('🔧 Starting WalletCore initialization...');

    walletCore = new WalletCore([], [], {
      onError: (err) => {
        console.error('WalletCore error callback:', err);
        log('WALLET_ERR · ' + (err?.message || err), 'er');
      }
    });

    console.log('✅ WalletCore created');
    window.__walletCore = walletCore; // 🔥 expose segera setelah dibuat
    console.log('🔍 WalletCore methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(walletCore)).join(', '));
    log('WALLET_CORE · Initialized', 'ok');

    // ✅ CONNECT EVENT
    console.log('📌 Setting up connect listener...');
    walletCore.on('connect', async (account) => {
      try {
        console.log('✅ Connect event fired, account:', account);
        walletAccount = account;

        let addr = '';
        if (typeof account?.address === 'string') {
          addr = account.address;
        } else if (account?.address?.toString) {
          addr = account.address.toString();
        } else if (account?.accounts?.[0]?.address) {
          addr = account.accounts[0].address.toString();
        }

        console.log('📍 Address extracted:', addr);

        if (!addr || !addr.startsWith('0x')) {
          console.warn('❌ ADDRESS INVALID:', account);
          return;
        }

        walletAddress = addr;
        console.log('🎉 Calling onWalletConnected with:', addr);
        await onWalletConnected(addr);
      } catch (connectErr) {
        console.error('❌ Connect handler error:', connectErr);
      }
    });

    // ✅ DISCONNECT EVENT
    console.log('📌 Setting up disconnect listener...');
    walletCore.on('disconnect', () => {
      try {
        console.log('🔌 Disconnect event fired');
        onWalletDisconnected();
      } catch (disconnectErr) {
        console.error('❌ Disconnect handler error:', disconnectErr);
      }
    });

    // ✅ ACCOUNT CHANGE EVENT
    console.log('📌 Setting up accountChange listener...');
    walletCore.on('accountChange', async (account) => {
      try {
        console.log('🔄 AccountChange event fired, account:', account);
        walletAccount = account;

        let addr = '';
        if (typeof account?.address === 'string') {
          addr = account.address;
        } else if (account?.address?.toString) {
          addr = account.address.toString();
        } else if (account?.accounts?.[0]?.address) {
          addr = account.accounts[0].address.toString();
        }

        if (addr) {
          walletAddress = addr;
          console.log('✅ Account changed to:', addr);
          log('ACCOUNT_CHANGE · ' + addr.slice(0, 12) + '...', 'in');
        }
      } catch (accountChangeErr) {
        console.error('❌ AccountChange handler error:', accountChangeErr);
      }
    });

    console.log('⏳ Waiting 800ms for wallet detection...');
    await new Promise(r => setTimeout(r, 800));

    console.log('✅ Timeout complete');

    const detected = walletCore.wallets || [];
    console.log('📱 Detected wallets:', detected.map(w => w.name));
    log('WALLETS · [' + detected.map(w => w.name).join(', ') + ']', 'ok');
    log('WALLET_CORE · Ready', 'ok');

    console.log('✅ WalletCore initialization complete');

  } catch (err) {
    console.error('❌ WalletCore initialization error:', err);
    console.error('   Message:', err?.message);
    console.error('   Stack:', err?.stack);

    log('WALLET_CORE · ' + err.message + ' — using fallback', 'in');
    walletCore = null;
  }
}

// helper: extract address from various response formats
function extractAddr(obj) {
  if (!obj) return null;
  const candidates = [
    obj?.address, obj?.publicKey,
    obj?.accounts?.[0]?.address, obj?.accounts?.[0],
    obj?.account?.address, obj?.account, obj
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === 'string' && c.startsWith('0x') && c.length > 10) return c;
    if (typeof c === 'object') {
      const s = c.toString?.();
      if (s && s.startsWith('0x') && s.length > 10) return s;
    }
  }
  return null;
}

// ── CONNECT ──────────────────────────────────────────
export async function connectWallet() {
  console.log('🔥 connectWallet called!');
  
  hd('s1'); sh('s2');
  log('CONNECT · Starting...', 'in');

  try {
    console.log('🔍 Checking walletCore:', !!walletCore);
    console.log('🔍 window.aptos:', !!window.aptos);
    console.log('🔍 window.petra:', !!window.petra);
    
    if (walletCore) {
      const wallets = walletCore.wallets || [];
      console.log('📱 Available wallets:', wallets.map(w => w.name));
      console.log('📱 Wallet states:', wallets.map(w => `${w.name}: ${w.readyState}`));
      
      const petra = wallets.find(w =>
        w.name === 'Petra' || w.name?.toLowerCase().includes('petra')
      );

      if (petra) {
        log('CONNECT · Petra → WalletCore', 'in');
        console.log('🔗 Connecting to Petra via WalletCore...');
        console.log('🔗 Petra readyState:', petra.readyState);
        
        if (petra.readyState === 'Installed') {
          await walletCore.connect(petra.name);
          return;
        } else {
          console.log('⚠️ Petra not installed, falling back to manual');
        }
      } else {
        console.log('⚠️ Petra not found in WalletCore, falling back to manual');
      }
    } else {
      console.log('⚠️ WalletCore not initialized, using manual connection');
    }

    // Fallback to manual connection
    console.log('🔄 Falling back to manual connection');
    await connectManual();

  } catch (err) {
    console.error('❌ Connect error:', err);
    hd('s2'); sh('s1');
    const msg = err?.message || '';

    if (err?.code === 4001 || /cancel|reject|denied|user/i.test(msg)) {
      toast('❌ Cancelled', 'er');
      log('CONNECT · Cancelled', 'er');
    } else {
      toast('❌ ' + msg, 'er');
      log('ERROR · ' + msg, 'er');
    }
  }
}

async function connectManual() {
  console.log('🔄 connectManual called!');
  await new Promise(r => setTimeout(r, 300));
  log('DEBUG · aptos=' + (!!window.aptos) + ' petra=' + (!!window.petra), 'in');

  console.log('🔍 Manual connection - window.aptos:', !!window.aptos);
  console.log('🔍 Manual connection - window.petra:', !!window.petra);

  let resp = null;

  if (window.aptos?.connect) {
    try {
      log('CONNECT · window.aptos.connect()...', 'in');
      console.log('🔗 Attempting window.aptos.connect()...');
      resp = await window.aptos.connect();
      console.log('✅ window.aptos.connect() response:', resp);
      log('DEBUG · resp: ' + JSON.stringify(resp), 'in');
    } catch (e) {
      console.error('❌ window.aptos.connect() error:', e);
      if (e?.code === 4001 || /cancel|reject|denied/i.test(e?.message || '')) {
        hd('s2'); sh('s1'); toast('❌ Cancelled', 'er'); return;
      }
      log('DEBUG · aptos err: ' + e.message, 'in');
    }
  }

  if (!resp && window.petra?.connect) {
    try {
      log('CONNECT · window.petra.connect()...', 'in');
      console.log('🔗 Attempting window.petra.connect()...');
      resp = await window.petra.connect();
      console.log('✅ window.petra.connect() response:', resp);
      log('DEBUG · resp: ' + JSON.stringify(resp), 'in');
    } catch (e) {
      console.error('❌ window.petra.connect() error:', e);
      if (e?.code === 4001 || /cancel|reject|denied/i.test(e?.message || '')) {
        hd('s2'); sh('s1'); toast('❌ Cancelled', 'er'); return;
      }
      log('DEBUG · petra err: ' + e.message, 'in');
    }
  }

  if (!resp) {
    hd('s2'); sh('s1');
    if (!window.aptos && !window.petra) {
      toast('❌ Petra not detected! Install Petra first.', 'er');
      log('ERROR · Install Petra from petra.app', 'er');
      console.error('❌ No Petra wallet detected');
    } else {
      toast('❌ Petra not responding. Try Ctrl+Shift+R', 'er');
      log('ERROR · No response — hard refresh & retry', 'er');
      console.error('❌ Petra detected but not responding');
    }
    return;
  }

  console.log('✅ Connection successful, setting up wallet account');
  walletAccount = window.aptos; // ✅ ambil wallet asli Petra

  let addr = '';

  try {
    console.log('🔍 Getting account address...');
    const acc = await window.aptos.account();
    console.log('✅ Account response:', acc);
    addr = acc.address;
    console.log('✅ Extracted address:', addr);
  } catch (e) {
    console.error('❌ Cannot get address:', e);
    log('ERROR · Cannot get address: ' + e.message, 'er');
    return;
  }

  if (!addr) {
    hd('s2'); sh('s1');
    log('ERROR · Address empty', 'er');
    toast('❌ Failed to get wallet address', 'er');
    console.error('❌ Address is empty');
    return;
  }

  console.log('🎉 Success! Calling onWalletConnected with:', addr);
  walletAddress = addr;
  onWalletConnected(addr);
}

// ── ON CONNECTED ─────────────────────────────────────
async function onWalletConnected(address) {
  try {
    console.log('🎯 onWalletConnected called with:', address);

    conn = true;
    walletAddress = address;

    log('CONNECTED · ' + address.slice(0, 14) + '...', 'ok');
    hd('s2'); 
    sh('s4');

    // 🔥 CREATE proper Account object untuk Shelby SDK
    console.log('📦 Creating Account object for Shelby SDK...');
    
    const accountForShelby = {
      accountAddress: address,
      publicKey: walletAccount?.publicKey || null,
      signingScheme: 'single_signature_scheme',
      
      sign: async (message) => {
        try {
          console.log('🔐 Signing message...');
          if (walletCore && typeof walletCore.signMessage === 'function') {
            const signature = await walletCore.signMessage({
              message: message,
              nonce: Math.random().toString(36).substring(7),
            });
            console.log('✅ Signed');
            return signature;
          }
          throw new Error('Wallet signing not available');
        } catch (err) {
          console.error('Sign error:', err);
          throw err;
        }
      },

      signTransaction: async (transaction) => {
        try {
          console.log('🔐 Signing transaction...');
          if (window.aptos?.signTransaction) {
            const signedTxn = await window.aptos.signTransaction(transaction);
            console.log('✅ Transaction signed');
            return signedTxn;
          }
          throw new Error('Transaction signing not available');
        } catch (err) {
          console.error('Transaction sign error:', err);
          throw err;
        }
      }
    };

    // Update UI
    const walletStatus = document.getElementById('ws');
    if (walletStatus) {
      walletStatus.textContent = address.slice(0, 6) + '...' + address.slice(-4);
    }

    // Update network status
    const networkStatus = document.getElementById('network-status');
    if (networkStatus) {
      networkStatus.textContent = 'Shelbynet'; // Assume Shelbynet for now
      networkStatus.style.color = 'var(--success)';
    }

    // Update wallet button
    const walletBtn = document.getElementById('walletBtn');
    if (walletBtn) {
      walletBtn.textContent = '🔗 ' + address.slice(0, 6) + '...';
    }

    // Get balance
    let aptBal = '0.0000', usdBal = '0.00';
    try {
      const balance = await getBalance(address);
      if (balance.apt) aptBal = parseFloat(balance.apt).toFixed(4);
      if (balance.usd) usdBal = parseFloat(balance.usd).toFixed(2);
    } catch (balanceErr) {
      console.error('Balance fetch error:', balanceErr);
    }

    const aptEl = document.getElementById('apt');
    const usdEl = document.getElementById('usd');
    if (aptEl) aptEl.textContent = aptBal;
    if (usdEl) usdEl.textContent = usdBal;

    // Load files
    await loadFiles();

    // Close modal
    closeModal();

    log('WALLET_READY · ' + address.slice(0, 10) + '...', 'ok');
    
  } catch (error) {
    console.error('❌ onWalletConnected error:', error);
    log('ON_CONNECTED_ERROR · ' + error.message, 'er');
  }
}

// ── ON DISCONNECTED ───────────────────────────────────
function onWalletDisconnected() {
  conn = false;
  walletAddress = null;
  walletAccount = null;

  // Update UI
  const walletStatus = document.getElementById('ws');
  if (walletStatus) {
    walletStatus.textContent = '—';
  }

  const networkStatus = document.getElementById('network-status');
  if (networkStatus) {
    networkStatus.textContent = 'Shelbynet';
    networkStatus.style.color = 'var(--text-muted)';
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
  
  log('DISCONNECTED', 'in');
}

// ── FILE OPERATIONS ────────────────────────────────────
async function loadFiles() {
  if (!walletAddress) return;
  
  try {
    console.log('Loading files for address:', walletAddress);
    // TODO: Implement file loading from Shelby protocol
  } catch (error) {
    console.error('Load files error:', error);
  }
}

// ── LOGGING ─────────────────────────────────────────────
function log(msg, type = 'in') {
  console.log('[' + type.toUpperCase() + '] ' + msg);
}

// ── TOAST NOTIFICATIONS ────────────────────────────────
function toast(msg, type = 'ok') {
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
  
  if (!walletCore) {
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
  
  const wallets = walletCore.wallets || [];
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
  console.log('🎯 initUI called!');
  
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
  
  console.log('🔧 window._sx exposed:', Object.keys(window._sx));
  console.log('🔧 connectWallet function:', typeof window._sx.connectWallet);
}

// ── HELPER FUNCTIONS ────────────────────────────────────
export function sh(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
export function hd(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

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
    toast('📤 Uploading files...', 'ok');
    console.log('Uploading files:', sel);
    // TODO: Implement file upload using shelby.js
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
