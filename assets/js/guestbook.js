(function () {
  var root = document.querySelector(".guestbook");
  if (!root) {
    return;
  }

  var form = root.querySelector(".guestbook-form");
  var nameInput = root.querySelector(".guestbook-name");
  var messageInput = root.querySelector(".guestbook-message");
  var colorInputs = Array.prototype.slice.call(root.querySelectorAll("input[name='color']"));
  var liveName = root.querySelector(".guestbook-live-name");
  var liveMessage = root.querySelector(".guestbook-live-message");
  var status = root.querySelector(".guestbook-status");
  var stack = root.querySelector(".guestbook-stack");
  var submit = root.querySelector(".guestbook-submit");
  var tableName = root.dataset.supabaseTable || "guestbook_entries";
  var supabaseUrl = root.dataset.supabaseUrl;
  var supabaseKey = root.dataset.supabaseKey;
  var palette = ["#dceeb1", "#57e0c9", "#f98175", "#c5b0f4", "#f4ecd6", "#efd4d4", "#c8e6cd"];
  var localKey = "eunjin-guestbook-preview-v2";
  var lastSubmittedAt = 0;
  var client = null;

  function selectedColor() {
    var selected = colorInputs.find(function (input) {
      return input.checked;
    });
    return selected ? selected.value : palette[0];
  }

  function cleanText(value, fallback) {
    var text = (value || "").replace(/\s+/g, " ").trim();
    return text || fallback;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function setStatus(text) {
    status.textContent = text;
  }

  function renderEntry(entry, animate) {
    var item = document.createElement("li");
    var meta = document.createElement("p");
    var message = document.createElement("p");

    item.className = "guestbook-entry";
    item.style.setProperty("--entry-color", entry.color || palette[0]);
    if (animate) {
      item.classList.add("is-new");
    }

    meta.className = "guestbook-entry-meta";
    meta.textContent = formatDate(entry.created_at) + " / " + cleanText(entry.name, "anonymous");

    message.className = "guestbook-entry-message";
    message.textContent = entry.message;

    item.appendChild(meta);
    item.appendChild(message);
    stack.prepend(item);
  }

  function renderEntries(entries) {
    stack.innerHTML = "";
    entries.forEach(function (entry) {
      renderEntry(entry, false);
    });
  }

  function localEntries() {
    try {
      return JSON.parse(window.localStorage.getItem(localKey)) || [];
    } catch (error) {
      return [];
    }
  }

  function saveLocalEntry(entry) {
    var entries = localEntries();
    entries.unshift(entry);
    window.localStorage.setItem(localKey, JSON.stringify(entries.slice(0, 80)));
  }

  function hasSupabaseConfig() {
    return Boolean(supabaseUrl && supabaseKey && window.supabase);
  }

  async function loadEntries() {
    if (!hasSupabaseConfig()) {
      renderEntries(localEntries());
      setStatus("지금은 미리보기 모드입니다. 이 브라우저에만 방명록이 저장됩니다.");
      return;
    }

    client = window.supabase.createClient(supabaseUrl, supabaseKey);
    var result = await client
      .from(tableName)
      .select("id,name,message,color,created_at")
      .order("created_at", { ascending: false })
      .limit(80);

    if (result.error) {
      setStatus("방명록을 불러오지 못했습니다.");
      return;
    }

    renderEntries(result.data || []);
    setStatus("실시간 방명록이 열려 있습니다.");

    client
      .channel("guestbook-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: tableName }, function (payload) {
        renderEntry(payload.new, true);
      })
      .subscribe();
  }

  function updateLivePreview() {
    liveName.textContent = cleanText(nameInput.value, "anonymous");
    liveMessage.textContent = messageInput.value;
    root.querySelector(".guestbook-live").style.setProperty("--entry-color", selectedColor());
  }

  async function createEntry(entry) {
    if (!client) {
      saveLocalEntry(entry);
      renderEntry(entry, true);
      return;
    }

    var result = await client.from(tableName).insert({
      name: entry.name,
      message: entry.message,
      color: entry.color
    });

    if (result.error) {
      throw result.error;
    }
  }

  nameInput.addEventListener("input", updateLivePreview);
  messageInput.addEventListener("input", updateLivePreview);
  colorInputs.forEach(function (input) {
    input.addEventListener("change", updateLivePreview);
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var now = Date.now();
    var message = cleanText(messageInput.value, "");
    if (!message) {
      setStatus("한 문장 이상 남겨주세요.");
      return;
    }

    if (message.length > 240 || now - lastSubmittedAt < 5000) {
      setStatus("조금 천천히, 짧게 남겨주세요.");
      return;
    }

    var entry = {
      name: cleanText(nameInput.value, "anonymous").slice(0, 28),
      message: message.slice(0, 240),
      color: selectedColor(),
      created_at: new Date().toISOString()
    };

    submit.disabled = true;
    root.classList.add("is-sending");

    try {
      await createEntry(entry);
      lastSubmittedAt = now;
      messageInput.value = "";
      updateLivePreview();
      setStatus("띠롱, 남겨졌습니다.");
    } catch (error) {
      setStatus("잠시 후 다시 남겨주세요.");
    } finally {
      window.setTimeout(function () {
        root.classList.remove("is-sending");
        submit.disabled = false;
      }, 520);
    }
  });

  updateLivePreview();
  loadEntries();
})();
