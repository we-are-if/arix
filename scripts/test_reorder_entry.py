import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's see how category & counterparty are currently rendered
# In DailyWorkspace.tsx lines ~4705 to 4772:
counterparty_category_jsx = '''              <label>
                <span>Qarşı tərəf (Kontragent)</span>
                <div
                  className="counterparty-combobox"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCounterpartyMenuOpen(false);
                  }}
                >
                  <div className="counterparty-input-wrap">
                    <input
                      value={draft.counterparty}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, counterparty: event.target.value }));
                        setCounterpartyMenuOpen(true);
                      }}
                      onFocus={() => setCounterpartyMenuOpen(true)}
                      placeholder="Müştəri, təchizatçı və ya şəxs"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={counterpartyMenuOpen}
                      aria-controls="daily-counterparty-options"
                    />
                    <button
                      type="button"
                      className="counterparty-toggle"
                      title="Müştəri siyahısını aç"
                      aria-label="Müştəri siyahısını aç"
                      onClick={() => setCounterpartyMenuOpen((current) => !current)}
                    >
                      <ChevronDown size={17} />
                    </button>
                  </div>
                  {counterpartyMenuOpen && (
                    <div id="daily-counterparty-options" className="counterparty-options" role="listbox">
                      <div className="counterparty-options-head">
                        <span>Müştərilər</span>
                        <b>{filteredCustomers.length}</b>
                      </div>
                      {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
                        <button
                          type="button"
                          key={customer}
                          role="option"
                          aria-selected={draft.counterparty === customer}
                          className={draft.counterparty === customer ? "selected" : ""}
                          onClick={() => {
                            setDraft((current) => ({ ...current, counterparty: customer }));
                            setCounterpartyMenuOpen(false);
                          }}
                        >
                          <span>{customer}</span>
                          {draft.counterparty === customer && <Check size={15} />}
                        </button>
                      )) : <div className="counterparty-empty">Uyğun müştəri tapılmadı</div>}
                    </div>
                  )}
                </div>
              </label>
              <label>
                <span>Kateqoriya</span>
                <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} required>
                  <option value="" disabled>Kateqoriya seçin</option>
                  {draft.category && !categories.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}
                  {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </label>'''

print("Found counterparty_category_jsx in text:", counterparty_category_jsx.replace('\r\n', '\n') in text.replace('\r\n', '\n'))
