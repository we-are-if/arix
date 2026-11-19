import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's inspect the entire form-grid block in EntryDialog
start_marker = '<div className="form-grid">'
end_marker = '<label className="full">\n            <span>Açıqlama</span>'

start_idx = text.find(start_marker)
end_idx = text.find(end_marker)
if end_idx == -1:
    end_marker = '<label className="full">\r\n            <span>Açıqlama</span>'
    end_idx = text.find(end_marker)

print(f"start_idx: {start_idx}, end_idx: {end_idx}")
assert start_idx != -1 and end_idx != -1

old_block = text[start_idx:end_idx]

# Let's write the new form-grid block:
# For Azart Membran (!isSparexpert), exactly the same.
# For SparExpert (isSparexpert):
#   - If kind === "transfer":
#       Məbləğ -> Çıxış Hesabı -> Giriş Hesabı
#   - If kind !== "transfer":
#       Məbləğ -> Kateqoriya & Kontragent -> Ödəniş/Daxilolma Kanalı (Kassa/Bank/Kart) -> Ödəniş forması (əgər xərc və kart/bankdırsa)
new_block = '''<div className="form-grid">
          <label className="full">
            <span>Məbləğ</span>
            <div className="amount-field">
              <input autoFocus inputMode="decimal" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" required />
              <b>AZN</b>
            </div>
          </label>

          {isSparexpert ? (
            kind === "transfer" ? (
              /* SparExpert Transfer (Google Sheet: Hesablararası Köçürmə) */
              dialogVariant === "variant1" ? (
                <>
                  <label className="full">
                    <span>Çıxış Hesabı (Haradan)</span>
                    <select
                      value={selectedSourceAccId}
                      onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                    >
                      {cashAccounts.length > 0 && (
                        <optgroup label="💵 KASSA (NAĞD)">
                          {cashAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {bankAccounts.length > 0 && (
                        <optgroup label="🏦 RƏSMİ BANK HESABLARI">
                          {bankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {cardAccounts.length > 0 && (
                        <optgroup label="💳 KARTLAR (BİZNES VƏ ŞƏXSİ)">
                          {cardAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  <label className="full">
                    <span>Giriş Hesabı (Haraya)</span>
                    <select
                      value={selectedTargetAccId}
                      onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                    >
                      {cashAccounts.length > 0 && (
                        <optgroup label="💵 KASSA (NAĞD)">
                          {cashAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {bankAccounts.length > 0 && (
                        <optgroup label="🏦 RƏSMİ BANK HESABLARI">
                          {bankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {cardAccounts.length > 0 && (
                        <optgroup label="💳 KARTLAR (BİZNES VƏ ŞƏXSİ)">
                          {cardAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                </>
              ) : (
                <div className="v2-transfer-grid full">
                  <div className="v2-transfer-col">
                    <div className="v2-transfer-col-header">
                      <ArrowUpRight size={15} style={{ color: "#ef4444" }} />
                      <span>Çıxış Hesabı (Haradan)</span>
                    </div>
                    <div className="v2-channel-pills compact">
                      <button
                        type="button"
                        className={`v2-channel-btn cash ${sourceCategory === "cash" ? "active" : ""}`}
                        onClick={() => handleSelectSourceCategory("cash")}
                      >
                        <Banknote size={14} />
                        <span>Kassa</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn bank ${sourceCategory === "bank" ? "active" : ""}`}
                        onClick={() => handleSelectSourceCategory("bank")}
                      >
                        <Landmark size={14} />
                        <span>Bank</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn card ${sourceCategory === "card" ? "active" : ""}`}
                        onClick={() => handleSelectSourceCategory("card")}
                      >
                        <CreditCard size={14} />
                        <span>Kart</span>
                      </button>
                    </div>
                    {sourceCategory === "card" ? (
                      cardMode === "v1_person_first" ? (
                        <>
                          <select
                            value={selectedSourceAccId}
                            onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                          >
                            {sourceCategoryOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                          <div className="bank-pills-row compact">
                            {cardBanksList.map((b) => (
                              <button
                                key={b}
                                type="button"
                                className={`bank-pill-btn compact ${sourceCardBank === b ? "active" : ""}`}
                                onClick={() => handleSelectSourceCardBank(b)}
                                title={b}
                              >
                                <BankLogo bank={b} size={13} />
                                <span>{b.replace(" Bank", "")}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bank-pills-row compact">
                            {cardBanksList.map((b) => (
                              <button
                                key={b}
                                type="button"
                                className={`bank-pill-btn compact ${sourceCardBank === b ? "active" : ""}`}
                                onClick={() => handleSelectSourceCardBank(b)}
                                title={b}
                              >
                                <BankLogo bank={b} size={13} />
                                <span>{b.replace(" Bank", "")}</span>
                              </button>
                            ))}
                          </div>
                          <select
                            value={selectedSourceAccId}
                            onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                          >
                            {sourceCategoryOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.person} · {sourceCardBank}</option>
                            ))}
                          </select>
                        </>
                      )
                    ) : sourceCategory === "bank" ? (
                      <>
                        <div className="bank-pills-row compact">
                          {officialBanksList.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`bank-pill-btn compact ${sourceOfficialBank === b ? "active" : ""}`}
                              onClick={() => handleSelectSourceOfficialBank(b)}
                              title={b}
                            >
                              <BankLogo bank={b} size={13} />
                              <span>{b.replace(" Bank", "")}</span>
                            </button>
                          ))}
                        </div>
                        <select
                          value={selectedSourceAccId}
                          onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                        >
                          {sourceOfficialBankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <select
                        value={selectedSourceAccId}
                        onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                      >
                        {sourceCategoryOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="v2-transfer-col">
                    <div className="v2-transfer-col-header">
                      <ArrowDownLeft size={15} style={{ color: "#10b981" }} />
                      <span>Giriş Hesabı (Haraya)</span>
                    </div>
                    <div className="v2-channel-pills compact">
                      <button
                        type="button"
                        className={`v2-channel-btn cash ${targetCategory === "cash" ? "active" : ""}`}
                        onClick={() => handleSelectTargetCategory("cash")}
                      >
                        <Banknote size={14} />
                        <span>Kassa</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn bank ${targetCategory === "bank" ? "active" : ""}`}
                        onClick={() => handleSelectTargetCategory("bank")}
                      >
                        <Landmark size={14} />
                        <span>Bank</span>
                      </button>
                      <button
                        type="button"
                        className={`v2-channel-btn card ${targetCategory === "card" ? "active" : ""}`}
                        onClick={() => handleSelectTargetCategory("card")}
                      >
                        <CreditCard size={14} />
                        <span>Kart</span>
                      </button>
                    </div>
                    {targetCategory === "card" ? (
                      cardMode === "v1_person_first" ? (
                        <>
                          <select
                            value={selectedTargetAccId}
                            onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                          >
                            {targetCategoryOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                          <div className="bank-pills-row compact">
                            {cardBanksList.map((b) => (
                              <button
                                key={b}
                                type="button"
                                className={`bank-pill-btn compact ${targetCardBank === b ? "active" : ""}`}
                                onClick={() => handleSelectTargetCardBank(b)}
                                title={b}
                              >
                                <BankLogo bank={b} size={13} />
                                <span>{b.replace(" Bank", "")}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bank-pills-row compact">
                            {cardBanksList.map((b) => (
                              <button
                                key={b}
                                type="button"
                                className={`bank-pill-btn compact ${targetCardBank === b ? "active" : ""}`}
                                onClick={() => handleSelectTargetCardBank(b)}
                                title={b}
                              >
                                <BankLogo bank={b} size={13} />
                                <span>{b.replace(" Bank", "")}</span>
                              </button>
                            ))}
                          </div>
                          <select
                            value={selectedTargetAccId}
                            onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                          >
                            {targetCategoryOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.person} · {targetCardBank}</option>
                            ))}
                          </select>
                        </>
                      )
                    ) : targetCategory === "bank" ? (
                      <>
                        <div className="bank-pills-row compact">
                          {officialBanksList.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`bank-pill-btn compact ${targetOfficialBank === b ? "active" : ""}`}
                              onClick={() => handleSelectTargetOfficialBank(b)}
                              title={b}
                            >
                              <BankLogo bank={b} size={13} />
                              <span>{b.replace(" Bank", "")}</span>
                            </button>
                          ))}
                        </div>
                        <select
                          value={selectedTargetAccId}
                          onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                        >
                          {targetOfficialBankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <select
                        value={selectedTargetAccId}
                        onChange={(event) => onSelectSparexpertTargetAccount(event.target.value)}
                      >
                        {targetCategoryOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            ) : (
              /* SparExpert Mədaxil / Məxaric (Google Sheet sırası: Məbləğ -> Kateqoriya & Kontragent -> Hesab/Kanal -> Ödəniş Forması) */
              <>
                <label>
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
                </label>

                {/* Hesab / Kanal seçimi (Kassa / Rəsmi Bank / Kartlar) */}
                {dialogVariant === "variant1" ? (
                  <label className="full">
                    <span>Hesab (Kassa / Bank / Kart)</span>
                    <select
                      value={selectedSourceAccId}
                      onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                    >
                      {cashAccounts.length > 0 && (
                        <optgroup label="💵 KASSA (NAĞD)">
                          {cashAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {bankAccounts.length > 0 && (
                        <optgroup label="🏦 RƏSMİ BANK HESABLARI">
                          {bankAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {cardAccounts.length > 0 && (
                        <optgroup label="💳 KARTLAR (BİZNES VƏ ŞƏXSİ)">
                          {cardAccounts.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                ) : (
                  <>
                    <div className="variant2-channel-box full">
                      <span className="field-label">Ödəniş / Daxilolma Kanalı</span>
                      <div className="v2-channel-pills">
                        <button
                          type="button"
                          className={`v2-channel-btn cash ${sourceCategory === "cash" ? "active" : ""}`}
                          onClick={() => handleSelectSourceCategory("cash")}
                        >
                          <Banknote size={15} />
                          <span>💵 Kassa (Nağd)</span>
                        </button>
                        <button
                          type="button"
                          className={`v2-channel-btn bank ${sourceCategory === "bank" ? "active" : ""}`}
                          onClick={() => handleSelectSourceCategory("bank")}
                        >
                          <Landmark size={15} />
                          <span>🏦 Rəsmi Bank</span>
                        </button>
                        <button
                          type="button"
                          className={`v2-channel-btn card ${sourceCategory === "card" ? "active" : ""}`}
                          onClick={() => handleSelectSourceCategory("card")}
                        >
                          <CreditCard size={15} />
                          <span>💳 Kartlar</span>
                        </button>
                      </div>
                    </div>
                    {sourceCategory === "card" ? (
                      <div className="card-selector-container full">
                        <div className="card-mode-switch-bar">
                          <span className="card-mode-label">Kartda Bank Seçimi:</span>
                          <div className="card-mode-buttons">
                            <button
                              type="button"
                              className={`c-mode-pill ${cardMode === "v1_person_first" ? "active" : ""}`}
                              onClick={() => {
                                setCardMode("v1_person_first");
                                localStorage.setItem("sparexpert-card-mode", "v1_person_first");
                              }}
                            >
                              1. Şəxs ➔ Bank Düymələri
                            </button>
                            <button
                              type="button"
                              className={`c-mode-pill ${cardMode === "v2_bank_first" ? "active" : ""}`}
                              onClick={() => {
                                setCardMode("v2_bank_first");
                                localStorage.setItem("sparexpert-card-mode", "v2_bank_first");
                              }}
                            >
                              2. Bank Alt-Tabı ➔ Şəxs
                            </button>
                          </div>
                        </div>

                        {cardMode === "v1_person_first" ? (
                          <>
                            <label className="full">
                              <span>Kart Hesabı (Məsul şəxs)</span>
                              <select
                                value={selectedSourceAccId}
                                onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                              >
                                {sourceCategoryOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                              </select>
                            </label>
                            <div className="card-bank-selector full">
                              <span className="field-label">Kartın Bankı / Şəbəkəsi</span>
                              <div className="bank-pills-row">
                                {cardBanksList.map((b) => (
                                  <button
                                    key={b}
                                    type="button"
                                    className={`bank-pill-btn ${sourceCardBank === b ? "active" : ""}`}
                                    onClick={() => handleSelectSourceCardBank(b)}
                                  >
                                    <BankLogo bank={b} size={15} />
                                    <span>{b}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="card-bank-selector full">
                              <span className="field-label">Bank Alt-Tabı (Əvvəlcə Bankı seçin)</span>
                              <div className="bank-pills-row">
                                {cardBanksList.map((b) => (
                                  <button
                                    key={b}
                                    type="button"
                                    className={`bank-pill-btn ${sourceCardBank === b ? "active" : ""}`}
                                    onClick={() => handleSelectSourceCardBank(b)}
                                  >
                                    <BankLogo bank={b} size={15} />
                                    <span>{b}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                            <label className="full">
                              <span>{sourceCardBank} Kartı (Məsul şəxs)</span>
                              <select
                                value={selectedSourceAccId}
                                onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                              >
                                {sourceCategoryOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>{opt.person} · {sourceCardBank}</option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                      </div>
                    ) : sourceCategory === "bank" ? (
                      <div className="official-bank-selector-container full">
                        <span className="field-label">Rəsmi Bank Seçimi</span>
                        <div className="bank-pills-row">
                          {officialBanksList.map((b) => (
                            <button
                              key={b}
                              type="button"
                              className={`bank-pill-btn ${sourceOfficialBank === b ? "active" : ""}`}
                              onClick={() => handleSelectSourceOfficialBank(b)}
                            >
                              <BankLogo bank={b} size={15} />
                              <span>{b}</span>
                            </button>
                          ))}
                        </div>
                        <label className="full" style={{ marginTop: "4px" }}>
                          <span>{sourceOfficialBank} Hesabı</span>
                          <select
                            value={selectedSourceAccId}
                            onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                          >
                            {sourceOfficialBankAccounts.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <label className="full">
                        <span>Kassa seçimi (Məsul şəxs)</span>
                        <select
                          value={selectedSourceAccId}
                          onChange={(event) => onSelectSparexpertAccount(event.target.value)}
                        >
                          {sourceCategoryOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.cleanLabel}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}

                {kind === "expense" && draft.channel.toLocaleLowerCase("az-AZ") !== "kassa" && (
                  <div className="expense-method-group full">
                    <span className="field-label">Ödəniş forması (Bank / Kart çıxışı)</span>
                    <div className="expense-method-toggle" role="radiogroup">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.expenseMethod === "online"}
                        className={draft.expenseMethod === "online" ? "active" : ""}
                        onClick={() => setDraft((current) => ({ ...current, expenseMethod: "online" }))}
                      >
                        <CreditCard size={15} />
                        <span>Onlayn / POS</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.expenseMethod === "diff_bank"}
                        className={draft.expenseMethod === "diff_bank" ? "active" : ""}
                        onClick={() => setDraft((current) => ({ ...current, expenseMethod: "diff_bank" }))}
                      >
                        <ArrowUpRight size={15} />
                        <span>Fərqli banka köçürmə</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.expenseMethod === "same_bank"}
                        className={draft.expenseMethod === "same_bank" ? "active" : ""}
                        onClick={() => setDraft((current) => ({ ...current, expenseMethod: "same_bank" }))}
                      >
                        <ArrowLeftRight size={15} />
                        <span>Eyni banka köçürmə</span>
                      </button>
                    </div>
                    <small className="expense-method-hint">
                      {draft.expenseMethod === "diff_bank"
                        ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (fərqli bank)» sütununa düşəcək və aylıq kart limitindən çıxılacaq.`
                        : draft.expenseMethod === "same_bank"
                        ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (eyni bank)» sütununa düşəcək.`
                        : `💡 ${draft.channel || "Kart"} kartı ilə POS terminal və ya internet ödənişi (standart onlayn xərc).`}
                    </small>
                  </div>
                )}
              </>
            )
          ) : (
            /* AZART MEMBRAN (!isSparexpert): 100% Orijinal Struktur */
            <>
              <label>
                <span>{kind === "transfer" ? "Çıxış: Şəxs" : "Şəxs (Hesab sahibi / məsul)"}</span>
                <select value={draft.person} onChange={(event) => setDraft((current) => ({ ...current, person: event.target.value }))}>
                  {personOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                </select>
              </label>
              <label>
                <span>{kind === "transfer" ? "Çıxış: Hesab / Kanal" : "Hesab / Kanal"}</span>
                <select value={draft.channel} onChange={(event) => setDraft((current) => ({ ...current, channel: event.target.value }))}>
                  {channelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </label>

              {kind === "expense" && draft.channel.toLocaleLowerCase("az-AZ") !== "kassa" && (
                <div className="expense-method-group full">
                  <span className="field-label">Ödəniş forması (Bank / Kart çıxışı)</span>
                  <div className="expense-method-toggle" role="radiogroup">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.expenseMethod === "online"}
                      className={draft.expenseMethod === "online" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "online" }))}
                    >
                      <CreditCard size={15} />
                      <span>Onlayn / POS</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.expenseMethod === "diff_bank"}
                      className={draft.expenseMethod === "diff_bank" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "diff_bank" }))}
                    >
                      <ArrowUpRight size={15} />
                      <span>Fərqli banka köçürmə</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.expenseMethod === "same_bank"}
                      className={draft.expenseMethod === "same_bank" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, expenseMethod: "same_bank" }))}
                    >
                      <ArrowLeftRight size={15} />
                      <span>Eyni banka köçürmə</span>
                    </button>
                  </div>
                  <small className="expense-method-hint">
                    {draft.expenseMethod === "diff_bank"
                      ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (fərqli bank)» sütununa düşəcək və aylıq kart limitindən çıxılacaq.`
                      : draft.expenseMethod === "same_bank"
                      ? `💡 ${draft.channel || "Kart"} hesabatında «Köçürmə (eyni bank)» sütununa düşəcək.`
                      : `💡 ${draft.channel || "Kart"} kartı ilə POS terminal və ya internet ödənişi (standart onlayn xərc).`}
                  </small>
                </div>
              )}

              {kind === "transfer" ? (
                <>
                  <label>
                    <span>Giriş: Şəxs</span>
                    <select value={draft.targetPerson} onChange={(event) => setDraft((current) => ({ ...current, targetPerson: event.target.value }))}>
                      {personOptions.map((person) => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Giriş: Hesab / Kanal</span>
                    <select value={draft.targetChannel} onChange={(event) => setDraft((current) => ({ ...current, targetChannel: event.target.value }))}>
                      {channelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
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
                  </label>
                </>
              )}
            </>
          )}
          '''

text = text[:start_idx] + new_block + text[end_idx:]

with open('daily-app/src/DailyWorkspace.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Reordered EntryDialog successfully!")
