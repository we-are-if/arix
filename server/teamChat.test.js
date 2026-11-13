import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHAT_CHANNELS,
  ensureChatStorage,
  getChatChannels,
  createChatChannel,
  getChatMessages,
  postChatMessage,
  markChatRead,
  buildDmChannelId,
  toggleChatPin,
  getChatAvatar,
  canChatSeeUser,
  touchChatPresence,
} from "./teamChat.js";
import { saveChatProfile } from "./chatExperience.js";

test("teamChat: initializes default channels and reads empty state", () => {
  const db = {};
  const user = { id: "user1", name: "Ekrem", role: "Satış" };
  const res = getChatChannels(db, user);
  assert.equal(res.channels.length, 4);
  assert.equal(res.totalUnread, 0);
  assert.equal(res.channels[0].name, "Genel Sohbet");
});

test("teamChat: creates new custom group channel", () => {
  const db = {};
  const user = { id: "user1", name: "Ekrem", role: "Satış" };
  const chan = createChatChannel(db, user, { name: "Proforma Özel", icon: "📑", description: "Özel proforma görüşmeleri" });
  assert.equal(chan.name, "Proforma Özel");
  assert.equal(chan.icon, "📑");

  const res = getChatChannels(db, user);
  assert.equal(res.channels.length, 5);
});

test("teamChat: posts message and retrieves messages", () => {
  const db = {};
  const user1 = { id: "user1", name: "Ekrem", role: "Satış" };
  const user2 = { id: "user2", name: "Arif", role: "Yönetici" };

  const msg = postChatMessage(db, user1, {
    channelId: "general",
    text: "Merhaba ekip!",
    orderReference: { id: "ord-1", number: "ORD-100", customerName: "Abanos" },
  });

  assert.equal(msg.text, "Merhaba ekip!");
  assert.equal(msg.senderName, "Ekrem");
  assert.equal(msg.orderReference.number, "ORD-100");

  const msgs = getChatMessages(db, user2, "general");
  assert.equal(msgs.messages.length, 1);
  assert.equal(msgs.messages[0].text, "Merhaba ekip!");

  // Unread calculation for user2
  const channelsForUser2 = getChatChannels(db, user2);
  const genChan = channelsForUser2.channels.find((c) => c.id === "general");
  assert.equal(genChan.unreadCount, 1);
  assert.equal(channelsForUser2.totalUnread, 1);

  // Mark read
  markChatRead(db, user2, "general");
  const channelsAfterRead = getChatChannels(db, user2);
  const genAfter = channelsAfterRead.channels.find((c) => c.id === "general");
  assert.equal(genAfter.unreadCount, 0);
  assert.equal(channelsAfterRead.totalUnread, 0);
});

test("teamChat: direct messages between two users", () => {
  const user1 = { id: "user1", name: "Ekrem", role: "Satış" };
  const user2 = { id: "user2", name: "Arif", role: "Yönetici" };
  const db = { authUsers: [user1, user2] };

  const dmId = buildDmChannelId(user1.id, user2.id);
  postChatMessage(db, user1, { channelId: dmId, text: "Selam Arif Bey" });

  const msgs = getChatMessages(db, user2, dmId);
  assert.equal(msgs.messages.length, 1);
  assert.equal(msgs.messages[0].text, "Selam Arif Bey");

  const user3 = { id: "user3", name: "Hasan", role: "Depo" };
  assert.throws(() => {
    getChatMessages(db, user3, dmId);
  }, /yetkiniz yok/);
});

test("teamChat: pinned message is returned even when it is outside the fetched page", () => {
  const db = { authUsers: [{ id: "a", name: "A" }] };
  const user = { id: "a", name: "A" };
  const first = postChatMessage(db, user, { channelId: "general", text: "pin me" });
  for (let i = 0; i < 30; i++) postChatMessage(db, user, { channelId: "general", text: `m${i}` });
  assert.equal(getChatMessages(db, user, "general", { limit: 5 }).pinnedMessage, null);
  toggleChatPin(db, user, { channelId: "general", messageId: first.id });
  const page = getChatMessages(db, user, "general", { limit: 10 });
  assert.equal(page.pinnedMessageId, first.id);
  assert.equal(page.pinnedMessage.id, first.id);
  assert.equal(page.pinnedMessage.text, "pin me");
  assert.equal(page.messages.some((m) => m.id === first.id), false);
  assert.equal(page.typing, undefined);
});

test("teamChat: channels expose avatarUrl/hasAvatar and never the base64 avatar", () => {
  const avatar = "data:image/png;base64,iVBORw0KGgo=";
  const db = { authUsers: [{ id: "u1", name: "Ali", companyId: "ersa-folyo" }, { id: "u2", name: "Veli", companyId: "ersa-folyo" }] };
  saveChatProfile(db, { id: "u2", name: "Veli" }, { about: "Merhaba", avatar });
  const res = getChatChannels(db, { id: "u1", name: "Ali", companyId: "ersa-folyo" });
  const contact = res.allContacts.find((c) => c.targetUserId === "u2");
  assert.equal(contact.hasAvatar, true);
  assert.match(contact.avatarUrl, /^\/api\/orders\/chat\/avatar\/u2\?v=\d+$/);
  assert.equal(contact.about, "Merhaba");
  assert.equal("avatar" in contact, false);
  assert.equal(res.directMessages.find((c) => c.targetUserId === "u2").hasAvatar, true);
  assert.equal(JSON.stringify(res).includes("base64"), false);
});

test("teamChat: avatar bytes are parsed from storage and missing avatars return null", () => {
  const db = { authUsers: [{ id: "a", name: "A" }] };
  saveChatProfile(db, { id: "a", name: "A" }, { avatar: "data:image/jpeg;base64,/9j/" });
  const avatar = getChatAvatar(db, "a");
  assert.equal(avatar.mime, "image/jpeg");
  assert.deepEqual([...avatar.bytes], [0xff, 0xd8, 0xff]);
  assert.ok(avatar.updatedAt);
  assert.equal("avatar" in db.chatProfiles.a, false);
  assert.equal(getChatAvatar(db, "nobody"), null);
});

test("teamChat: avatar lookup is rejected for a user from another company", () => {
  const db = {
    authUsers: [{ id: "a", name: "A", companyId: "ersa-folyo" }, { id: "x", name: "X", companyId: "other-co" }, { id: "legacy", name: "L" }],
  };
  saveChatProfile(db, { id: "x", name: "X" }, { avatar: "data:image/png;base64,iVBORw0KGgo=" });
  assert.equal(getChatAvatar(db, "x").mime, "image/png");
  assert.equal(canChatSeeUser(db.authUsers[0], db.authUsers[1]), false);
  assert.equal(canChatSeeUser(db.authUsers[0], db.authUsers[2]), true);
  assert.equal(canChatSeeUser({ id: "no-company" }, db.authUsers[1]), true);
});

test("teamChat: company isolation hides other-company contacts", () => {
  const db = {
    authUsers: [
      { id: "me", name: "Me", companyId: "ersa-folyo" },
      { id: "mate", name: "Mate", companyId: "ersa-folyo" },
      { id: "legacy", name: "Legacy" },
      { id: "alien", name: "Alien", companyId: "other-co" },
    ],
  };
  const res = getChatChannels(db, db.authUsers[0]);
  assert.deepEqual(res.allContacts.filter((c) => !c.id.startsWith("assistant:")).map((c) => c.targetUserId).sort(), ["legacy", "mate"]);
  assert.equal(res.directMessages.some((c) => c.targetUserId === "alien"), false);
  assert.equal(res.directMessages[0].id, "assistant:me");
});

test("teamChat: presence survives a read clone through the in-memory map", () => {
  const db = { authUsers: [{ id: "viewer", name: "V" }, { id: "presence-user", name: "P" }] };
  touchChatPresence(db, { id: "presence-user" });
  const clone = structuredClone(db);
  delete clone.chatPresence["presence-user"];
  const contact = getChatChannels(clone, { id: "viewer", name: "V" }).allContacts.find((c) => c.targetUserId === "presence-user");
  assert.equal(contact.isOnline, true);
  touchChatPresence(db, { id: "presence-user" }, false);
  assert.equal(getChatChannels(db, { id: "viewer", name: "V" }).allContacts.find((c) => c.targetUserId === "presence-user").isOnline, false);
});
