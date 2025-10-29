// phantom-embed.js
// Nhúng file này bằng <script src="..."></script>
// Yêu cầu: chạy trên HTTPS. Không lưu khóa riêng trong client.

(function () {
  const INSTALL_URL = "https://phantom.app/";
  let provider = null;
  let currentPublicKey = null;
  let accountChangeCallbacks = [];

  // Try to get provider (Phantom)
  function detectProvider() {
    if (window.solana && window.solana.isPhantom) {
      provider = window.solana;
      // listen for account changes
      provider.on && provider.on("accountChanged", handleAccountChanged);
    } else {
      provider = null;
    }
    return provider;
  }

  function handleAccountChanged(publicKey) {
    if (publicKey) {
      currentPublicKey = publicKey.toString ? publicKey.toString() : publicKey;
    } else {
      currentPublicKey = null;
    }
    accountChangeCallbacks.forEach(cb => {
      try { cb(currentPublicKey); } catch (e) { console.error(e); }
    });
  }

  async function connect(opts = {}) {
    detectProvider();
    if (!provider) {
      // open Phantom install page in new tab
      window.open(INSTALL_URL, "_blank");
      throw new Error("Phantom not found. Open https://phantom.app/ to install.");
    }
    try {
      // opt: onlyIfTrusted: true để kiểm tra kết nối tự động (nếu wallet đã trust)
      const resp = await provider.connect(opts);
      // resp.publicKey is a PublicKey object
      currentPublicKey = resp.publicKey.toString();
      return { publicKey: currentPublicKey };
    } catch (err) {
      // user rejected or other error
      throw err;
    }
  }

  async function disconnect() {
    detectProvider();
    if (!provider) return;
    try {
      await provider.disconnect();
      currentPublicKey = null;
    } catch (e) {
      console.warn("Disconnect error:", e);
    }
  }

  function isConnected() {
    detectProvider();
    return !!currentPublicKey || (provider && provider.isConnected) || false;
  }

  function getPublicKey() {
    detectProvider();
    if (currentPublicKey) return currentPublicKey;
    if (provider && provider.publicKey) return provider.publicKey.toString();
    return null;
  }

  async function signMessage(message) {
    // message: string or Uint8Array
    detectProvider();
    if (!provider) throw new Error("Phantom not found");
    const textEncoder = new TextEncoder();
    const data = typeof message === "string" ? textEncoder.encode(message) : message;
    // signMessage returns { signature: Uint8Array, publicKey: PublicKey }
    const signed = await provider.signMessage(data, "utf8");
    return signed;
  }

  async function signTransaction(transaction) {
    // transaction: a solana Transaction object (from @solana/web3.js) serialized or object
    detectProvider();
    if (!provider) throw new Error("Phantom not found");
    // Note: to use signTransaction you need to pass a Transaction instance.
    // Caller must import @solana/web3.js and build Transaction, then call this function.
    const signed = await provider.signTransaction(transaction);
    return signed; // Transaction signed
  }

  function onAccountChange(callback) {
    if (typeof callback === "function") {
      accountChangeCallbacks.push(callback);
    }
    // immediately call with current value
    callback(getPublicKey());
    return () => {
      accountChangeCallbacks = accountChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  // Simple ui widget insertion (button) - can be hidden by CSS in host site
  function injectButton(opts = {}) {
    if (document.getElementById("phantom-embed-btn")) return;
    const btn = document.createElement("button");
    btn.id = "phantom-embed-btn";
    btn.style = "position:fixed;right:16px;bottom:16px;padding:10px 14px;border-radius:10px;border:none;background:#512da8;color:white;cursor:pointer;z-index:999999;font-family:Inter,Arial,sans-serif";
    btn.textContent = "Connect Phantom";
    btn.onclick = async function () {
      try {
        const res = await connect();
        btn.textContent = shortenKey(res.publicKey);
        btn.title = res.publicKey;
      } catch (e) {
        console.warn(e);
        // open install if not found
        if (e.message && e.message.includes("Phantom not found")) {
          if (confirm("Phantom không được tìm thấy. Mở trang cài đặt?")) {
            window.open(INSTALL_URL, "_blank");
          }
        }
      }
    };
    document.body.appendChild(btn);

    // update if provider already connected
    detectProvider();
    if (provider && provider.isConnected) {
      const pk = getPublicKey();
      if (pk) btn.textContent = shortenKey(pk);
    }
  }

  function shortenKey(key) {
    if (!key) return "";
    return key.slice(0, 4) + "…" + key.slice(-4);
  }

  // Auto-detect and store initial public key if already connected/trusted
  function tryAutoConnect() {
    detectProvider();
    if (!provider) return;
    // Try onlyIfTrusted first so it won't popup the wallet UI
    provider.connect({ onlyIfTrusted: true })
      .then(res => {
        if (res && res.publicKey) {
          currentPublicKey = res.publicKey.toString();
          accountChangeCallbacks.forEach(cb => cb(currentPublicKey));
          const btn = document.getElementById("phantom-embed-btn");
          if (btn) btn.textContent = shortenKey(currentPublicKey);
        }
      })
      .catch(() => {
        // ignore
      });
  }

  // Expose global API
  window.PhantomConnector = {
    detectProvider,
    connect,
    disconnect,
    isConnected,
    getPublicKey,
    signMessage,
    signTransaction,
    onAccountChange,
    injectButton,
  };

  // Auto-run detection and try auto connect (non intrusive)
  document.addEventListener("DOMContentLoaded", () => {
    detectProvider();
    tryAutoConnect();
    // inject UI button by default; host can hide via CSS or not call injectButton
    injectButton();
  });

  // helpful debug
  console.log("PhantomConnector loaded. Use window.PhantomConnector.connect()");
})();
