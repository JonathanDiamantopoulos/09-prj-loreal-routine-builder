/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearSelectionButton = document.getElementById("clearSelection");
const selectionStorageStatus = document.getElementById(
  "selectionStorageStatus"
);
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

// Add the class-hosted Cloudflare Worker URL here when it is provided.
const workerUrl = "https://orange-bush-ffbc.jidiaman.workers.dev/";
const selectionStorageKey = "lorealRoutineSelectedProductIds";

// Keep selected products and chat history for follow-up requests.
let allProducts = [];
let selectedProducts = [];
let conversationMessages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal beauty advisor. Use the selected products and answer concisely.",
  },
];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Choose a category to discover products
  </div>
`;

/* Load product data from the local JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create cards for the filtered products */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.some((item) => item.id === product.id);
      return `
        <div class="product-card ${isSelected ? "selected" : ""}"
          data-product-id="${product.id}" role="group" tabindex="0"
          aria-label="Select ${product.name}">
          <span class="select-mark"><i class="fa-solid fa-check"></i></span>
          <button class="description-toggle" type="button"
            aria-expanded="false" aria-label="Show description for ${product.name}">
            <i class="fa-solid fa-plus"></i>
          </button>
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
          </div>
          <div class="product-description">
            ${product.description}
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => toggleProduct(card.dataset.productId));
    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleProduct(card.dataset.productId);
      }
    });

    const descriptionButton = card.querySelector(".description-toggle");
    descriptionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = card.classList.toggle("description-open");
      descriptionButton.setAttribute("aria-expanded", isOpen.toString());
      descriptionButton.setAttribute(
        "aria-label",
        `${isOpen ? "Hide" : "Show"} description for ${
          allProducts.find(
            (product) => product.id === Number(card.dataset.productId)
          ).name
        }`
      );
      descriptionButton.innerHTML = isOpen
        ? '<i class="fa-solid fa-minus"></i>'
        : '<i class="fa-solid fa-plus"></i>';
    });
  });
}

/* Add or remove a product from the selected list */
function toggleProduct(productId) {
  const id = Number(productId);
  const isAlreadySelected = selectedProducts.some((product) => product.id === id);

  if (isAlreadySelected) {
    selectedProducts = selectedProducts.filter((product) => product.id !== id);
  } else {
    const product = allProducts.find((item) => item.id === id);
    if (product) selectedProducts.push(product);
  }

  saveSelectedProducts();
  updateSelectedProducts();

  if (categoryFilter.value) {
    displayProducts(
      allProducts.filter((product) => product.category === categoryFilter.value)
    );
  }
}

/* Save selected product IDs so the list can be restored after a reload */
function saveSelectedProducts() {
  try {
    const productIds = selectedProducts.map((product) => product.id);
    localStorage.setItem(selectionStorageKey, JSON.stringify(productIds));
    selectionStorageStatus.textContent = "";
  } catch (error) {
    selectionStorageStatus.textContent =
      "Your selection could not be saved in this browser.";
  }
}

/* Restore saved products after the product catalog is available */
function restoreSelectedProducts() {
  try {
    const savedProductIds = localStorage.getItem(selectionStorageKey);
    if (!savedProductIds) return;

    const productIds = JSON.parse(savedProductIds);
    if (!Array.isArray(productIds)) {
      selectionStorageStatus.textContent =
        "Saved selections could not be read. You can make a new selection.";
      return;
    }

    selectedProducts = allProducts.filter((product) =>
      productIds.includes(product.id)
    );
  } catch (error) {
    selectionStorageStatus.textContent =
      "Saved selections could not be read. You can make a new selection.";
  }
}

/* Update the selected-products panel */
function updateSelectedProducts() {
  selectedCount.textContent = selectedProducts.length;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="empty-selection">Choose a few products to begin building your personalized routine.</p>';
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-item">
          <img src="${product.image}" alt="">
          <div>
            <strong>${product.name}</strong>
            <span>${product.brand}</span>
          </div>
          <button class="remove-product" data-product-id="${product.id}"
            aria-label="Remove ${product.name}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `
    )
    .join("");

  document.querySelectorAll(".remove-product").forEach((button) => {
    button.addEventListener("click", () =>
      toggleProduct(button.dataset.productId)
    );
  });
}

updateSelectedProducts();

/* Load the catalog, then restore saved products */
const productsPromise = loadProducts();
productsPromise.then((products) => {
  allProducts = products;
  restoreSelectedProducts();
  updateSelectedProducts();
});

/* Filter products when the category changes */
categoryFilter.addEventListener("change", async () => {
  if (allProducts.length === 0) allProducts = await productsPromise;

  const filteredProducts = allProducts.filter(
    (product) => product.category === categoryFilter.value
  );

  displayProducts(filteredProducts);
});

/* Remove all products from the selection at once */
clearSelectionButton.addEventListener("click", () => {
  selectedProducts = [];
  saveSelectedProducts();
  updateSelectedProducts();

  if (categoryFilter.value) {
    displayProducts(
      allProducts.filter((product) => product.category === categoryFilter.value)
    );
  }
});

/* Generate a routine from the user's selected products */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    addChatMessage(
      "assistant",
      "Start by selecting at least one product, and I’ll build from there."
    );
    return;
  }

  const productDetails = selectedProducts
    .map((product) => `${product.brand} ${product.name}: ${product.description}`)
    .join("\n");

  await sendToAdvisor(
    `Create a clear, personalized beauty routine using these selected products:\n${productDetails}`
  );
});

/* Send follow-up questions through the chat form */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = userInput.value.trim();
  if (!message) return;

  userInput.value = "";
  await sendToAdvisor(message);
});

/* Add a message to the visible chat window */
function addChatMessage(role, content) {
  const messageElement = document.createElement("div");
  messageElement.className =
    role === "user"
      ? "chat-message user-message"
      : "chat-message assistant-message";
  messageElement.textContent = content;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Send the full conversation to the Cloudflare Worker */
async function sendToAdvisor(message) {
  addChatMessage("user", message);
  conversationMessages.push({ role: "user", content: message });

  if (!workerUrl) {
    addChatMessage(
      "assistant",
      "Your routine advisor is ready to connect. Add the class Cloudflare Worker URL in script.js."
    );
    return;
  }

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationMessages }),
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;

    conversationMessages.push({ role: "assistant", content: reply });
    addChatMessage("assistant", reply);
  } catch (error) {
    addChatMessage(
      "assistant",
      "I couldn’t reach the routine advisor. Please try again."
    );
  }
}
