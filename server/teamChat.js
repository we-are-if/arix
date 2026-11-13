import { randomUUID } from "node:crypto";

const presenceMemory = new Map();

export function chatError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function canChatSeeUser(caller, target) {
  const mine = String(caller?.companyId || "");
  const theirs = String(target?.companyId || "");
  return !mine || !theirs || mine === theirs;
}

function newestIso(...values) {
  let newest = null;
  for (const value of values) {
    if (!value) continue;
    if (!newest || new Date(value).getTime() > new Date(newest).getTime()) newest = value;
  }
  return newest;
}

export function chatAvatarUrl(userId, updatedAt) {
  const version = new Date(updatedAt || 0).getTime();
  return `/api/orders/chat/avatar/${encodeURIComponent(String(userId))}?v=${Number.isFinite(version) ? version : 0}`;
}

export function chatPersonProfile(db, userId) {
  const profile = db.chatProfiles?.[String(userId)];
  const avatar = db.chatAvatars?.[String(userId)];
  return {
    ...(profile?.about ? { about: profile.about } : {}),
    hasAvatar: Boolean(avatar?.dataUrl),
    avatarUrl: avatar?.dataUrl ? chatAvatarUrl(userId, avatar.updatedAt) : null,
  };
}

export function getChatAvatar(db, userId) {
  ensureChatStorage(db);
  const record = db.chatAvatars?.[String(userId || "")];
  if (!record?.dataUrl) return null;
  const match = String(record.dataUrl).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { bytes: Buffer.from(match[2], "base64"), mime: `image/${match[1]}`, updatedAt: record.updatedAt || null };
}

export const DEFAULT_CHAT_CHANNELS = [
  { id: "general", name: "Genel Sohbet", type: "group", icon: "📢", description: "Tüm şirket çalışanları", isDefault: true },
  { id: "orders-export", name: "Siparişler & İhracat", type: "group", icon: "📦", description: "Sipariş durumları, proforma, evraklar", isDefault: true },
  { id: "warehouse", name: "Depo & Sevkiyat", type: "group", icon: "🏭", description: "Palet, rulo, kesim ve yükleme detayları", isDefault: true },
  { id: "accounting", name: "Muhasebe & Finans", type: "group", icon: "💰", description: "Ödemeler, banka ve dekontlar", isDefault: true },
];

export function ensureChatStorage(db) {
  db.chatChannels ??= [];
  db.chatMessages ??= [];
  db.chatReads ??= {};
  db.chatPresence ??= {};
  db.chatPins ??= {};
  db.chatUploads ??= {};
  db.chatMuted ??= {};
  db.chatProfiles ??= {};
  db.chatAvatars ??= {};

  // The four seeded default channels carry no companyId, so every company sees them.
  for (const def of DEFAULT_CHAT_CHANNELS) {
    if (!db.chatChannels.some((c) => c.id === def.id)) {
      db.chatChannels.push({
        ...def,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "Sistem",
      });
    }
  }
}

export function touchChatPresence(db, authUser, active = true) {
  ensureChatStorage(db);
  const userId = String(authUser?.id || "");
  if (!userId) return;
  if (active) {
    const now = new Date().toISOString();
    db.chatPresence[userId] = now;
    presenceMemory.set(userId, now);
  } else {
    delete db.chatPresence[userId];
    presenceMemory.delete(userId);
  }
}

export function formatPresence(presenceIso, fallbackLastSeenIso = null) {
  // isOnline is strictly TRUE ONLY if the user is actively inside the open chat within the last 35 seconds!
  // App login/background activity never makes anyone appear online.
  const isOnline = Boolean(
    presenceIso &&
    !isNaN(new Date(presenceIso).getTime()) &&
    Date.now() - new Date(presenceIso).getTime() < 35 * 1000
  );

  const activityIso = presenceIso || fallbackLastSeenIso || null;
  if (!activityIso) {
    return { isOnline: false, text: "çevrimdışı", lastSeenAt: null };
  }

  if (isOnline) {
    return { isOnline: true, text: "çevrimiçi", lastSeenAt: presenceIso };
  }

  const date = new Date(activityIso);
  if (isNaN(date.getTime())) {
    return { isOnline: false, text: "çevrimdışı", lastSeenAt: null };
  }

  const tz = "Europe/Istanbul";
  const timeStr = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const today = new Date();
  const fmtDate = (d) => d.toLocaleDateString("tr-TR", { timeZone: tz });
  const isToday = fmtDate(date) === fmtDate(today);

  const yesterday = new Date(today.getTime() - 86400000);
  const isYesterday = fmtDate(date) === fmtDate(yesterday);

  let text = `son görülme: ${date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz })} ${timeStr}`;
  if (isToday) {
    text = `son görülme: bugün ${timeStr}`;
  } else if (isYesterday) {
    text = `son görülme: dün ${timeStr}`;
  }

  return { isOnline: false, text, lastSeenAt: activityIso };
}

export function buildDmChannelId(userId1, userId2) {
  const sorted = [String(userId1), String(userId2)].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

export function buildAssistantChannelId(userId) {
  return `assistant:${String(userId || "")}`;
}

function assistantChannelCard(db, userId) {
  const channelId = buildAssistantChannelId(userId);
  const messages = (db.chatMessages || []).filter((message) => message.channelId === channelId);
  const last = messages.at(-1) || null;
  return {
    id: channelId,
    name: "AriX Asistan",
    type: "dm",
    icon: "🤖",
    role: "Sistem asistanı",
    targetUserId: "assistant",
    isOnline: true,
    lastSeenText: "çevrimiçi",
    lastActivityAt: new Date().toISOString(),
    unreadCount: 0,
    messageCount: messages.length,
    lastMessage: last ? { id: last.id, text: last.text || "", senderName: last.senderName, createdAt: last.createdAt } : null,
  };
}

export function getChatChannels(db, authUser) {
  ensureChatStorage(db);

  const userId = String(authUser?.id || "");
  const userReads = db.chatReads[userId] || {};

  // Group channels
  const channels = (db.chatChannels || [])
    .filter((channel) => !channel.companyId || !authUser?.companyId || channel.companyId === String(authUser.companyId))
    .map((channel) => {
    const channelMsgs = (db.chatMessages || []).filter((m) => m.channelId === channel.id);
    const lastMsg = channelMsgs.at(-1) || null;
    const lastReadAt = userReads[channel.id] || "1970-01-01T00:00:00.000Z";
    const unreadCount = channelMsgs.filter((m) => m.createdAt > lastReadAt && String(m.senderId) !== userId && m.senderId !== "system").length;

    return {
      id: channel.id,
      ...(db.chatPreferences?.[userId]?.[channel.id] || {}),
      muted: Boolean(db.chatMuted[userId]?.[channel.id]),
      name: channel.name,
      type: channel.type || "group",
      icon: channel.icon || "💬",
      description: channel.description || "",
      isDefault: Boolean(channel.isDefault),
      unreadCount,
      lastMessage: lastMsg ? {
        id: lastMsg.id,
        text: lastMsg.text || (lastMsg.imageUrl ? "📷 Fotoğraf" : ""),
        senderName: lastMsg.senderName,
        createdAt: lastMsg.createdAt,
      } : null,
    };
  });

  // Build list of all team members
  const allTeamMembers = (db.authUsers || [])
    .filter((u) => u && u.active !== false && (userId ? String(u.id) !== userId : true) && canChatSeeUser(authUser, u))
    .map((member) => {
      const dmId = buildDmChannelId(userId || "guest", member.id);
      const dmMsgs = (db.chatMessages || []).filter((m) => m.channelId === dmId);
      const lastMsg = dmMsgs.at(-1) || null;
      const lastReadAt = userReads[dmId] || "1970-01-01T00:00:00.000Z";
      const unreadCount = dmMsgs.filter((m) => m.createdAt > lastReadAt && String(m.senderId) !== userId && m.senderId !== "system").length;

      const presenceAt = newestIso(db.chatPresence?.[String(member.id)] || null, presenceMemory.get(String(member.id)) || null);
      const presence = formatPresence(presenceAt, member.lastLoginAt);
      const lastActivity = presenceAt || member.lastLoginAt || null;

      return {
        id: dmId,
        ...(db.chatPreferences?.[userId]?.[dmId] || {}),
        ...chatPersonProfile(db, member.id),
        muted: Boolean(db.chatMuted[userId]?.[dmId]),
        targetUserId: member.id,
        name: member.name || member.email || "Ekip Üyesi",
        type: "dm",
        icon: "👤",
        role: member.role || "Çalışan",
        email: member.email || "",
        unreadCount,
        isOnline: presence.isOnline,
        lastSeenText: presence.text,
        lastActivityAt: lastActivity,
        messageCount: dmMsgs.length,
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          text: lastMsg.text || (lastMsg.imageUrl ? "📷 Fotoğraf" : ""),
          senderName: lastMsg.senderName,
          createdAt: lastMsg.createdAt,
        } : null,
      };
    });

  // All company colleagues are listed in directMessages:
  // Sorted by: 1. Unread count descending, 2. Online presence descending, 3. Recent activity descending
  const activeDirectMessages = [...allTeamMembers].sort((a, b) => {
    const unreadDiff = (b.unreadCount || 0) - (a.unreadCount || 0);
    if (unreadDiff !== 0) return unreadDiff;
    const onlineDiff = (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0);
    if (onlineDiff !== 0) return onlineDiff;
    const timeA = a.lastMessage?.createdAt || a.lastActivityAt || "";
    const timeB = b.lastMessage?.createdAt || b.lastActivityAt || "";
    return timeB.localeCompare(timeA);
  });

  // "allContacts" lists EVERY company colleague (Directory / Rehber) for starting new chats
  const allContacts = allTeamMembers.sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Every user has a private line with the built-in assistant
  const assistantCard = userId ? assistantChannelCard(db, userId) : null;
  const directMessages = assistantCard ? [assistantCard, ...activeDirectMessages] : activeDirectMessages;
  const contacts = assistantCard ? [assistantCard, ...allContacts] : allContacts;

  const allActive = [...channels, ...directMessages];
  const totalUnread = allActive.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return {
    channels,
    directMessages,
    allContacts: contacts,
    totalUnread,
  };
}

export function createChatChannel(db, authUser, { name, icon, description }) {
  ensureChatStorage(db);
  touchChatPresence(db, authUser);

  const cleanName = String(name || "").trim();
  if (!cleanName) throw chatError("Grup adı boş bırakılamaz.");
  if (cleanName.length > 50) throw chatError("Grup adı 50 karakterden uzun olamaz.");

  const channelId = `group-${randomUUID().slice(0, 8)}`;
  const channel = {
    id: channelId,
    name: cleanName,
    type: "group",
    icon: String(icon || "💬").slice(0, 4),
    description: String(description || "").trim().slice(0, 150),
    createdAt: new Date().toISOString(),
    createdBy: authUser?.name || "Kullanıcı",
    createdById: authUser?.id || "",
    companyId: authUser?.companyId || "",
    isDefault: false,
  };

  db.chatChannels.push(channel);
  return channel;
}

export function getChatMessages(db, authUser, channelId, { limit = 50, before = null, search = "" } = {}) {
  ensureChatStorage(db);
  touchChatPresence(db, authUser);

  const cleanChannelId = String(channelId || "general").trim();
  const userId = String(authUser?.id || "");

  assertChatAccess(db, authUser, cleanChannelId);
  let isDm = false;
  let otherUserId = "";

  // If DM channel, ensure user is part of it
  if (cleanChannelId.startsWith("dm:")) {
    isDm = true;
    const parts = cleanChannelId.split(":");
    if (parts.length !== 3 || (parts[1] !== userId && parts[2] !== userId)) {
      throw chatError("Bu sohbete erişim yetkiniz yok.", 403);
    }
    otherUserId = parts[1] === userId ? parts[2] : parts[1];
  }

  const otherReadAt = otherUserId ? (db.chatReads[otherUserId]?.[cleanChannelId] || "1970-01-01T00:00:00.000Z") : null;
  const pinnedMessageId = db.chatPins?.[cleanChannelId] || null;

  let msgs = db.chatMessages.filter((m) => m.channelId === cleanChannelId);
  if (search) { const term=String(search).slice(0,200).toLocaleLowerCase("tr").replaceAll("ı","i"); msgs=msgs.filter(m=>[m.text,m.orderReference?.number,m.orderReference?.customerName,m.productReference?.name].filter(Boolean).join(" ").toLocaleLowerCase("tr").replaceAll("ı","i").includes(term)); }
  if (before) {
    const cursorIndex=msgs.findIndex(m=>m.id===before);
    msgs = cursorIndex>=0 ? msgs.slice(0,cursorIndex) : msgs.filter((m) => m.createdAt < before);
  }

  // Slice last `limit` messages
  const sliced = msgs.slice(-Math.min(100, Math.max(1, Number(limit) || 50)));

  // Annotate messages with read receipts & pin status
  const annotate = (m) => {
    let readStatus = "sent";
    if (String(m.senderId) === userId) {
      if (isDm) {
        if (otherReadAt && otherReadAt >= m.createdAt) readStatus = "read"; // Double blue ticks
      } else {
        // In group:
        const anyOtherRead = Object.entries(db.chatReads || {}).some(
          ([readerId, reads]) => readerId !== userId && reads[cleanChannelId] && reads[cleanChannelId] >= m.createdAt
        );
        if (anyOtherRead) readStatus = "read";
      }
    }

    return {
      ...m,
      readStatus, // 'sent' | 'read'
      isRead: readStatus === "read",
      isPinned: pinnedMessageId === m.id,
    };
  };
  const enriched = sliced.map(annotate);
  const pinnedMsg = pinnedMessageId ? db.chatMessages.find((m) => m.channelId === cleanChannelId && m.id === pinnedMessageId) : null;

  return {
    channelId: cleanChannelId,
    messages: enriched,
    hasMore: msgs.length > sliced.length,
    pinnedMessageId,
    pinnedMessage: pinnedMsg ? annotate(pinnedMsg) : null,
  };
}

export function toggleChatPin(db, authUser, { channelId, messageId }) {
  ensureChatStorage(db);
  touchChatPresence(db, authUser);

  const cleanChannelId = String(channelId || "").trim();
  const cleanMsgId = String(messageId || "").trim();
  if (!cleanChannelId || !cleanMsgId) throw chatError("Kanal ve mesaj kimliği gereklidir.");

  assertChatAccess(db,authUser,cleanChannelId);
  if(!db.chatMessages.some(m=>m.channelId===cleanChannelId && m.id===cleanMsgId)) throw chatError('Mesaj bu sohbete ait değil.', 404);
  db.chatPins ??= {};
  if (db.chatPins[cleanChannelId] === cleanMsgId) {
    delete db.chatPins[cleanChannelId];
  } else {
    db.chatPins[cleanChannelId] = cleanMsgId;
  }

  return { ok: true, pinnedMessageId: db.chatPins[cleanChannelId] || null };
}

export function postChatMessage(db, authUser, {
  channelId,
  text,
  imageUrl = null,
  audioUrl = null,
  audioDuration = null,
  orderReference = null,
  productReference = null,
  replyToReference = null,
  clientMessageId = null,
  fileReference = null,
}) {
  ensureChatStorage(db);
  touchChatPresence(db, authUser);

  const cleanChannelId = String(channelId || "general").trim();
  assertChatAccess(db, authUser, cleanChannelId);
  const cleanText = String(text || "").trim();
  const cleanImage = imageUrl ? String(imageUrl).trim() : null;
  const cleanAudio = audioUrl ? String(audioUrl).trim() : null;
  const userId = String(authUser?.id || "");

  if (!cleanText && !cleanImage && !cleanAudio && !orderReference && !productReference && !fileReference) {
    throw chatError("Boş mesaj gönderilemez.");
  }
  if (cleanText.length > 2000) throw chatError("Mesaj 2000 karakterden uzun olamaz.");

  // If DM channel, ensure user is part of it
  if (cleanChannelId.startsWith("dm:")) {
    const parts = cleanChannelId.split(":");
    if (parts.length !== 3 || (parts[1] !== userId && parts[2] !== userId)) {
      throw chatError("Bu sohbete mesaj gönderemezsiniz.", 403);
    }
  }

  const requestId=String(clientMessageId || '').slice(0,100);
  if(requestId) {
    const existing=db.chatMessages.find(m=>m.senderId===userId && m.clientMessageId===requestId && m.channelId===cleanChannelId);
    if(existing)return {...existing, duplicate:true};
  }
  for(const media of [cleanImage,cleanAudio,fileReference?.url].filter(Boolean)) {
    if(!canAccessChatMedia(db,authUser,media)) throw chatError('Bu dosyayı paylaşma yetkiniz yok.', 403);
  }
  let cleanOrderRef = null;
  if (orderReference && typeof orderReference === "object") {
    cleanOrderRef = {
      id: String(orderReference.id || ""),
      number: String(orderReference.number || ""),
      customerName: String(orderReference.customerName || ""),
      palletNumber: orderReference.palletNumber != null ? String(orderReference.palletNumber) : undefined,
      rollCount: orderReference.rollCount != null ? Number(orderReference.rollCount) : undefined,
      palletDimensions: orderReference.palletDimensions ? String(orderReference.palletDimensions) : undefined,
      netWeight: orderReference.netWeight != null ? Number(orderReference.netWeight) : undefined,
      grossWeight: orderReference.grossWeight != null ? Number(orderReference.grossWeight) : undefined,
      status: orderReference.status ? String(orderReference.status) : undefined,
    };
  }

  let cleanProductRef = null;
  if (productReference && typeof productReference === "object") {
    cleanProductRef = {
      id: String(productReference.id || ""),
      name: String(productReference.name || ""),
      code: String(productReference.code || ""),
      stock: Number(productReference.stock || 0),
      unit: String(productReference.unit || "m"),
      price: productReference.price != null ? Number(productReference.price) : undefined,
      currency: String(productReference.currency || "USD"),
    };
  }

  let cleanReplyRef = null;
  if (replyToReference && typeof replyToReference === "object") {
    cleanReplyRef = {
      id: String(replyToReference.id || ""),
      senderName: String(replyToReference.senderName || ""),
      text: String(replyToReference.text || "").slice(0, 150),
    };
  }

  const now = new Date().toISOString();
  const message = {
    id: randomUUID(),
    clientMessageId: requestId || undefined,
    channelId: cleanChannelId,
    senderId: userId,
    senderName: authUser?.name || "Kullanıcı",
    senderRole: authUser?.role || "Çalışan",
    text: cleanText,
    imageUrl: cleanImage,
    audioUrl: cleanAudio,
    fileReference: fileReference ? {url:String(fileReference.url),name:String(db.chatUploads?.[fileReference.url]?.name || "Dosya"),size:Number(db.chatUploads?.[fileReference.url]?.size || 0)} : null,
    audioDuration: audioDuration ? Number(audioDuration) : null,
    orderReference: cleanOrderRef,
    productReference: cleanProductRef,
    replyToReference: cleanReplyRef,
    createdAt: now,
  };

  db.chatMessages.push(message);

  // Auto-mark sender as read
  db.chatReads[userId] ??= {};
  db.chatReads[userId][cleanChannelId] = now;

  return {
    ...message,
    readStatus: "sent",
    isRead: false,
    isPinned: false,
  };
}

// System notes (escalations, price answers, task assignments) never count as unread
// for a person and never come from a real participant.
export function postSystemMessage(db, channelId, { text = "", orderReference = null, productReference = null, taskReference = null } = {}) {
  ensureChatStorage(db);
  const message = {
    id: randomUUID(),
    channelId: String(channelId || "general"),
    senderId: "system",
    senderName: "AriX Asistan",
    senderRole: "Sistem",
    text: String(text || "").slice(0, 2000),
    imageUrl: null,
    audioUrl: null,
    audioDuration: null,
    fileReference: null,
    orderReference: orderReference || null,
    productReference: productReference || null,
    replyToReference: null,
    taskReference: taskReference || null,
    system: true,
    createdAt: new Date().toISOString(),
  };
  db.chatMessages.push(message);
  return message;
}

export function markChatRead(db, authUser, channelId, messageId) {
  ensureChatStorage(db);
  touchChatPresence(db, authUser);

  const cleanChannelId = String(channelId || "").trim();
  const userId = String(authUser?.id || "");
  if (!cleanChannelId || !userId) return { ok: false };

  db.chatReads[userId] ??= {};
  assertChatAccess(db,authUser,cleanChannelId);
  const visible=messageId ? db.chatMessages.find(m=>m.channelId===cleanChannelId && m.id===messageId) : db.chatMessages.filter(m=>m.channelId===cleanChannelId).at(-1);
  if(visible) db.chatReads[userId][cleanChannelId] = [db.chatReads[userId][cleanChannelId] || '', visible.createdAt].sort().at(-1);
  return { ok: true };
}

export function assertChatAccess(db, user, channelId) {
  ensureChatStorage(db);
  const id=String(user?.id || '');
  if (!id) throw chatError('Sohbet için giriş gerekli.', 401);
  const cleanId=String(channelId || '');
  if (cleanId.startsWith('assistant:')) {
    if (cleanId !== buildAssistantChannelId(id)) throw chatError('Bu sohbete erişim yetkiniz yok.', 403);
    return;
  }
  if (cleanId.startsWith('dm:')) {
    const parts=cleanId.split(':');
    if(parts.length!==3 || !parts.slice(1).includes(id)) throw chatError('Bu sohbete erişim yetkiniz yok.', 403);
    const other=parts[1]===id?parts[2]:parts[1];
    const otherUser=(db.authUsers || []).find(u=>String(u.id)===other && u.active!==false);
    if(!otherUser) throw chatError('Sohbet kullanıcısı bulunamadı.', 404);
    if(!canChatSeeUser(user, otherUser)) throw chatError('Bu sohbete erişim yetkiniz yok.', 403);
  } else {
    const channel=db.chatChannels.find(c=>c.id===cleanId);
    if(!channel) throw chatError('Bu sohbete erişim yetkiniz yok.', 404);
    if(channel.memberIds && !channel.memberIds.map(String).includes(id)) throw chatError('Bu sohbete erişim yetkiniz yok.', 403);
    if(!canChatSeeUser(user, channel)) throw chatError('Bu sohbete erişim yetkiniz yok.', 403);
  }
}
export function canAccessChatMedia(db,user,url) {
  const upload=db.chatUploads?.[url];
  if(upload && String(upload.ownerId)===String(user?.id)) return true;
  return (db.chatMessages||[]).some(m=>{
    if(m.imageUrl!==url && m.audioUrl!==url && m.fileReference?.url!==url)return false;
    try{assertChatAccess(db,user,m.channelId);return true;}catch{return false;}
  });
}

export function setChatMuted(db,user,channelId,muted) {
  assertChatAccess(db,user,channelId);
  db.chatMuted[String(user.id)] ??= {};
  db.chatMuted[String(user.id)][channelId]=Boolean(muted);
  return {muted:Boolean(muted)};
}
