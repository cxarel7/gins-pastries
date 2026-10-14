
(function () {
  const user = Auth.require("admin");
  if (!user) return;

  const $ = (id) => document.getElementById(id);
  const searchInput = $("csSearch");
  const sortSelect = $("csSort");
  const summary = $("csSummary");
  const list = $("csList");
  const pager = $("csPager");

  if (!searchInput || !sortSelect || !summary || !list || !pager) {
    console.error("Customer page elements are missing.");
    return;
  }

  const PAGE_SIZE = 10;
  let customers = [];
  let currentPage = 1;
  let loading = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function getCustomerName(customer) {
    return (
      customer.name ||
      [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
      "Unnamed customer"
    );
  }

  function showMessage(message, retry = false) {
    list.replaceChildren(element("div", "ad-empty", message));
    pager.replaceChildren();

    if (retry) {
      const button = element("button", "ad-btn", "Try again");
      button.type = "button";
      button.addEventListener("click", loadCustomers);
      pager.appendChild(button);
    }
  }

  function getFilteredCustomers() {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = customers.filter((customer) => {
      const searchable = [
        getCustomerName(customer),
        customer.email,
        customer.contact,
        customer.facebook
      ].filter(Boolean).join(" ").toLowerCase();

      return searchable.includes(query);
    });

    switch (sortSelect.value) {
      case "oldest":
        filtered.sort((a, b) =>
          String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
          Number(a.user_id) - Number(b.user_id)
        );
        break;

      case "name":
        filtered.sort((a, b) =>
          getCustomerName(a).localeCompare(getCustomerName(b))
        );
        break;

      case "orders":
        filtered.sort((a, b) =>
          Number(b.order_count || 0) - Number(a.order_count || 0)
        );
        break;

      case "newest":
      default:
        filtered.sort((a, b) =>
          String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
          Number(b.user_id) - Number(a.user_id)
        );
        break;
    }

    return filtered;
  }

  function createCustomerCard(customer) {
    const card = element("article", "cs-card");
    const heading = element("div", "cs-card-heading");
    const details = element("div", "cs-card-details");

    heading.appendChild(element("h3", "cs-name", getCustomerName(customer)));
    heading.appendChild(
      element(
        "span",
        customer.email_verified ? "cs-status verified" : "cs-status unverified",
        customer.email_verified ? "Verified" : "Unverified"
      )
    );

    function addDetail(label, value) {
      const row = element("div", "cs-detail");
      row.append(
        element("span", "cs-detail-label", label),
        element("span", "cs-detail-value", value || "Not provided")
      );
      details.appendChild(row);
    }

    addDetail("Email", customer.email);
    addDetail("Mobile number", customer.contact);
    addDetail("Facebook", customer.facebook);
    addDetail("Registered", formatDate(customer.created_at));
    addDetail("Total orders", String(customer.order_count || 0));

    card.append(heading, details);
    return card;
  }

  function render() {
    const filtered = getFilteredCustomers();
    const total = filtered.length;
    const pageCount = Math.ceil(total / PAGE_SIZE);

    currentPage = Math.max(1, Math.min(currentPage, pageCount || 1));

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    summary.textContent = total === 0
      ? "No customers found."
      : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} customer(s).`;

    if (total === 0) {
      list.replaceChildren(
        element("div", "ad-empty", "No customers match your search.")
      );
      pager.replaceChildren();
      return;
    }

    list.replaceChildren(...pageItems.map(createCustomerCard));
    pager.replaceChildren();

    const previous = element("button", "ad-btn", "Previous");
    previous.type = "button";
    previous.disabled = currentPage <= 1;
    previous.addEventListener("click", () => {
      currentPage--;
      render();
    });

    const pageLabel = element(
      "span",
      "cs-page-label",
      `Page ${currentPage} of ${pageCount}`
    );

    const next = element("button", "ad-btn", "Next");
    next.type = "button";
    next.disabled = currentPage >= pageCount;
    next.addEventListener("click", () => {
      currentPage++;
      render();
    });

    pager.append(previous, pageLabel, next);
  }

  async function loadCustomers() {
    if (loading) return;
    loading = true;

    summary.textContent = "";
    pager.replaceChildren();
    showMessage("Loading customers...");

    try {
      const response = await Auth.api("/api/admin/customers");

      if (!response.ok) {
        throw new Error(
          response.data?.error || "Could not load customers."
        );
      }

      const result = response.data;
      customers = Array.isArray(result)
        ? result
        : Array.isArray(result.customers)
          ? result.customers
          : [];

      currentPage = 1;
      render();
    } catch (error) {
      console.error("Customer loading error:", error);
      showMessage(error.message || "Could not load customers.", true);
    } finally {
      loading = false;
    }
  }

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  sortSelect.addEventListener("change", () => {
    currentPage = 1;
    render();
  });

  loadCustomers();
})();
