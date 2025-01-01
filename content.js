const GESTURES = [
  { name: "postcard", label: "💌 A postcard" },
  { name: "chocolate", label: "🍫 Some chocolate" },
  { name: "cooking", label: "🍝 A home-cooked meal" },
];

const createGestureFieldset = () => {
  const fieldset = document.createElement("fieldset");
  fieldset.classList.add("gesture-fieldset");
  const legend = document.createElement("legend");
  legend.classList.add("gesture-legend");
  legend.textContent =
    "What would you like to offer your host as a gesture of appreciation?";
  fieldset.appendChild(legend);

  GESTURES.forEach(({ name, label }) => {
    const checkboxLabel = document.createElement("label");
    checkboxLabel.classList.add("gesture-label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = name;
    checkbox.classList.add("gesture-checkbox");
    checkboxLabel.append(checkbox, label);
    fieldset.appendChild(checkboxLabel);
  });

  return fieldset;
};

const getSelectedGestures = () => {
  return GESTURES.reduce((selected, { name, label }) => {
    const checkbox = document.querySelector(`input[name="${name}"]`);
    return checkbox?.checked ? [...selected, label] : selected;
  }, []);
};

const extractUserIdFromButton = (button) => {
  const dataAttributes = button.getAttribute("data-amplitude-properties");
  const userIdMatch = dataAttributes?.match(/"other_user_id":(\d+)/);
  return userIdMatch ? userIdMatch[1] : null;
};

const extractCsUidFromScripts = () => {
  const csUidScript = Array.from(document.querySelectorAll("script")).find(
    (script) => script.textContent.includes("CS_UID")
  );
  const csUidMatch = csUidScript?.textContent.match(/CS_UID\s*=\s*'(\d+)'/);
  return csUidMatch ? csUidMatch[1] : null;
};

const fetchUserData = async (userId, guestUrl) => {
  const urls = {
    hostHomeInfo: `https://www.couchsurfing.com/users/${userId}/couch`,
    hostRefs: `https://www.couchsurfing.com/users/${userId}/references`,
  };

  const results = {};

  try {
    await Promise.all(
      Object.entries(urls).map(async ([key, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        results[key] = extractBody(await response.text());
      })
    );

    results.hostAboutInfo = extractBody(document.body.outerHTML);

    if (guestUrl) {
      const guestResponse = await fetch(guestUrl);
      if (guestResponse.ok) {
        results.guestAboutInfo = extractBody(await guestResponse.text());
      }
    }

    return results;
  } catch (error) {
    console.error("Error fetching user data:", error);
    throw error;
  }
};

const generateRequest = async (results, selectedGestures) => {
  try {
    const response = await fetch(
      "https://couchsurfing-ai-assistant-api.potato0.workers.dev/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results, selectedGestures }),
      }
    );

    if (!response.ok) throw new Error("Failed to generate request");

    return response.json();
  } catch (error) {
    console.error("Error generating request:", error);
    throw error;
  }
};

const setLoadingState = (isLoading) => {
  const buttons = document.querySelectorAll(".generate-request-btn");
  const textarea = document.getElementById("body");
  const checkboxes = document.querySelectorAll(".gesture-checkbox");
  const labels = document.querySelectorAll(".gesture-label");

  buttons.forEach((button) => {
    button.textContent = isLoading ? "Generating..." : "✨ Generate Request";
    button.disabled = isLoading;
    button.style.opacity = isLoading ? "0.5" : "1";
  });

  checkboxes.forEach((checkbox) => {
    checkbox.disabled = isLoading;
  });

  labels.forEach((label) => {
    label.style.opacity = isLoading ? "0.5" : "1";
  });

  if (textarea) {
    textarea.disabled = isLoading;
    textarea.style.opacity = isLoading ? "0.5" : "1";
  }
};

const createGenerateButton = (originalButton) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "✨ Generate Request";
  button.classList.add("generate-request-btn");

  button.addEventListener("click", async () => {
    try {
      setLoadingState(true);
      const userId = extractUserIdFromButton(originalButton);
      if (!userId) throw new Error("User ID not found");

      const guestUrlId = extractCsUidFromScripts();
      const results = await fetchUserData(
        userId,
        guestUrlId ? `https://www.couchsurfing.com/users/${guestUrlId}` : null
      );
      const selectedGestures = getSelectedGestures();
      const { result } = await generateRequest(results, selectedGestures);

      const textarea = document.getElementById("body");
      if (textarea) textarea.value = result;
    } catch (error) {
      console.error("Error generating request:", error);
    } finally {
      setLoadingState(false);
    }
  });

  return button;
};

const injectGenerateRequestFormElements = () => {
  const targetButtons = document.querySelectorAll(
    'button[data-amplitude-click="couch_request_send"]'
  );

  targetButtons.forEach((button) => {
    const formActionsList = button.closest(".form-actions-list");

    if (
      !formActionsList ||
      formActionsList.nextElementSibling?.classList.contains(
        "generate-request-container"
      )
    )
      return;

    const container = document.createElement("section");
    container.classList.add("generate-request-container");

    container.appendChild(createGestureFieldset());
    container.appendChild(createGenerateButton(button));

    formActionsList.parentElement?.insertBefore(
      container,
      formActionsList.nextSibling
    );
  });
};

const observer = new MutationObserver(injectGenerateRequestFormElements);
observer.observe(document.body, { childList: true, subtree: true });

injectGenerateRequestFormElements();

const extractBody = (html) => {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (!bodyMatch) return "";

  return (
    bodyMatch[1]
      .replace(/<(script|noscript|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/(?:\s|^)class="[^"]*"/g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim() || ""
  );
};
