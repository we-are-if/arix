import {ChatInfo,ChatMessageMenu,ChatTaskSheet,ChatTasksPanel} from "./ChatExperience";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import AriXLogo from "../../../src/components/AriXLogo";
import {
  Send, Plus, ArrowLeft, ChevronLeft, SquarePen, MessageSquare, Settings, X, Search, Users, User,
  Volume2, VolumeX, Bell, BellOff, ExternalLink,
  Check, CheckCheck, Camera, Image as ImageIcon, Box, Tag,
  Maximize2, Mic, MicOff, Play, Pause, CornerUpLeft,
  Pin, PinOff, FolderOpen, Layers, CheckCircle2, PackageCheck,
  Truck, Trash2, ChevronRight, FileText, Sparkles, RotateCcw, AlertCircle, ClipboardList
} from "lucide-react";

export type ChatOrderRef = {
  id?: string;
  number: string;
  customerName?: string;
  palletNumber?: string;
  rollCount?: number;
  palletDimensions?: string;
  netWeight?: number;
  grossWeight?: number;
  status?: string;
};

export type ChatProductRef = {
  id?: string;
  name: string;
  code?: string;
  stock?: number;
  unit?: string;
  price?: number;
  currency?: string;
};

export type ChatReplyRef = {
  id: string;
  senderName: string;
  text: string;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text: string;
  fileReference?: {url:string;name:string;size:number}|null;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDuration?: number | null;
  orderReference?: ChatOrderRef | null;
  productReference?: ChatProductRef | null;
  replyToReference?: ChatReplyRef | null;
  taskReference?: { id: string; title: string; assigneeName?: string; dueAt?: string | null; status?: string } | null;
  system?: boolean;
  readStatus?: "sent" | "delivered" | "read";
  isRead?: boolean;
  editedAt?: string;
  deletedAt?: string;
  forwarded?: boolean;
  reactions?: Record<string,string>;
  isPinned?: boolean;
  createdAt: string;
};

export type ChatOutboxEntry = {
  id: string;
  voiceData?: string;
  payload: {
    clientMessageId: string;
    channelId: string;
    text?: string;
    imageUrl?: string | null;
    audioUrl?: string | null;
    audioDuration?: number | null;
    orderReference?: ChatOrderRef | null;
    productReference?: ChatProductRef | null;
    replyToReference?: ChatReplyRef | null;
    fileReference?: { url: string; name?: string; size?: number } | null;
  };
};

export type ChatContact = {
  id: string;
  targetUserId: string;
  name: string;
  type: "dm";
  icon?: string;
  role?: string;
  email?: string;
  unreadCount?: number;
  muted?: boolean;
  avatar?: string;
  avatarUrl?: string;
  hasAvatar?: boolean;
  about?: string;
  pinned?: boolean;
  archived?: boolean;
  isOnline?: boolean;
  lastSeenText?: string;
  lastActivityAt?: string | null;
  messageCount?: number;
  lastMessage?: {
    id: string;
    text: string;
    senderName: string;
    createdAt: string;
  } | null;
};

export type ChatChannel = {
  id: string;
  name: string;
  type: "group" | "dm";
  icon?: string;
  role?: string;
  email?: string;
  description?: string;
  isDefault?: boolean;
  unreadCount?: number;
  muted?: boolean;
  avatar?: string;
  avatarUrl?: string;
  hasAvatar?: boolean;
  about?: string;
  pinned?: boolean;
  archived?: boolean;
  isOnline?: boolean;
  lastSeenText?: string;
  lastActivityAt?: string | null;
  targetUserId?: string;
  lastMessage?: {
    id: string;
    text: string;
    senderName: string;
    createdAt: string;
  } | null;
};

interface TeamChatWidgetProps {
  currentUser: { id: string; name: string; role: string };
  activeOrder?: { id: string; number: string; customerName?: string; status?: string } | null;
  orders?: Array<any>;
  products?: Array<any>;
  pushEnabled?: boolean;
  onEnablePush?: () => Promise<void>;
  onOpenOrder?: (orderNumber: string) => void;
  api: <T>(url: string, init?: RequestInit) => Promise<T>;
  isOpenExternal?: boolean;
  onCloseExternal?: () => void;
  presetOrder?: ChatOrderRef | null;
  presetProduct?: ChatProductRef | null;
  onClearPreset?: () => void;
}

// Generate consistent avatar gradient colors from a person's name
function getAvatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", // AriX Cobalt Blue
    "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", // Sky
    "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", // Indigo
    "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)", // Teal
    "linear-gradient(135deg, #059669 0%, #047857 100%)", // Emerald
    "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)", // Purple
    "linear-gradient(135deg, #d97706 0%, #b45309 100%)", // Amber
    "linear-gradient(135deg, #e11d48 0%, #be123c 100%)", // Rose
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getRoleBadge(role?: string): { label: string; colorClass: string } {
  const r = (role || "").toLowerCase();
  if (r.includes("sahib") || r.includes("owner") || r.includes("yönet")) {
    return { label: "Yönetim", colorClass: "role-owner" };
  }
  if (r.includes("muhasebe") || r.includes("mali") || r.includes("finans")) {
    return { label: "Muhasebe", colorClass: "role-accounting" };
  }
  if (r.includes("depo") || r.includes("sevkiyat") || r.includes("loji")) {
    return { label: "Depo", colorClass: "role-warehouse" };
  }
  if (r.includes("satış") || r.includes("temsilci") || r.includes("ihracat")) {
    return { label: "Satış & İhracat", colorClass: "role-sales" };
  }
  return { label: role || "Ekip", colorClass: "role-default" };
}

// Two-tone notification chime
let chimeContext: AudioContext | null = null;
function getChimeContext() {
  if (chimeContext && chimeContext.state !== "closed") return chimeContext;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  chimeContext = new AudioContextClass();
  return chimeContext;
}
function playNotificationChime() {
  try {
    const ctx = getChimeContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    osc2.frequency.setValueAtTime(880, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.06);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch {}
}

function formatAudioTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Interactive Audio Message Bubble Player
function AudioBubblePlayer({ audioUrl, duration }: { audioUrl: string; duration?: number | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(e.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    audio.playbackRate = next;
    setPlaybackRate(next);
  };

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="team-chat-audio-bubble">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        type="button"
        className="team-chat-audio-play-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? "Durdur" : "Oynat"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="team-chat-play-icon" />}
      </button>

      <div className="team-chat-audio-progress-wrap">
        <input
          type="range"
          min={0}
          max={totalDuration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="team-chat-audio-scrubber"
          style={{ backgroundSize: `${progressPct}% 100%` }}
        />
        <div className="team-chat-audio-meta">
          <span>{formatAudioTime(currentTime)} / {formatAudioTime(totalDuration)}</span>
        </div>
      </div>

      <button
        type="button"
        className="team-chat-audio-speed-btn"
        onClick={cycleSpeed}
        title="Oynatma hızı"
      >
        {playbackRate}x
      </button>
    </div>
  );
}

export function TeamChatWidget({
  currentUser,
  activeOrder,
  orders = [],
  products = [],
  pushEnabled = false,
  onEnablePush,
  onOpenOrder,
  api,
  isOpenExternal,
  onCloseExternal,
  presetOrder,
  presetProduct,
  onClearPreset,
}: TeamChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [infoOpen,setInfoOpen]=useState<"self"|"channel"|null>(null);
  const [menuMessage,setMenuMessage]=useState<ChatMessage|null>(null);
  const [taskSource,setTaskSource]=useState<ChatMessage|null>(null);
  const [tasksOpen,setTasksOpen]=useState(false);
  const [taskStats,setTaskStats]=useState({openCount:0,overdueCount:0});
  const [listFilter,setListFilter]=useState("all");
  const [typingNames,setTypingNames]=useState<string[]>([]);
  const typingAt=useRef(0);
  const [activeTab, setActiveTab] = useState<"dms" | "groups" | "settings">("dms");
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [directMessages, setDirectMessages] = useState<ChatChannel[]>([]);
  const [allContacts, setAllContacts] = useState<ChatContact[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [pinnedMessageInfo, setPinnedMessageInfo] = useState<ChatMessage | null>(null);
  const [text, setText] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const searchRef = useRef(""); searchRef.current=messageSearch;
  const [chatError, setChatError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [renderLimit, setRenderLimit] = useState(200);
  const renderLimitRef = useRef(200);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const requestSequence = useRef(0);
  const draftChannelRef = useRef<string | null>(null);
  const outboxKey = `arix-chat-outbox:${currentUser.id}`;
  const [outbox, setOutbox] = useState<ChatOutboxEntry[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(outboxKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry) => entry && typeof entry.id === "string" && entry.payload && typeof entry.payload === "object");
    } catch { return []; }
  });
  const outboxRef = useRef<ChatOutboxEntry[]>(outbox); outboxRef.current = outbox;
  const saveOutbox = (items: ChatOutboxEntry[]) => { outboxRef.current = items; setOutbox(items); try { localStorage.setItem(outboxKey, JSON.stringify(items)); } catch { setChatError("Bekleyen mesajlar bu cihazda saklanamadı. Sayfayı kapatmayın."); } };

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // View mode inside channel: 'messages' or 'mediaVault'
  const [channelView, setChannelView] = useState<"messages" | "mediaVault">("messages");
  const [vaultTab, setVaultTab] = useState<"all" | "photos" | "audio" | "orders">("all");

  // Replying to a specific message
  const [replyingTo, setReplyingTo] = useState<ChatReplyRef | null>(null);

  // Attachments in composer
  const [attachOrder, setAttachOrder] = useState<ChatOrderRef | null>(null);
  const [attachProduct, setAttachProduct] = useState<ChatProductRef | null>(null);
  const [attachImage, setAttachImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const lastPresetOrderKeyRef = useRef<string | null>(null);
  const lastPresetProductKeyRef = useRef<string | null>(null);
  const targetChannelIdRef = useRef<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const recordingSecondsRef = useRef(0);

  // Modals & Drawers
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [drillOrder, setDrillOrder] = useState<any | null>(null);
  const [customPalletNum, setCustomPalletNum] = useState("");
  const [customRollCount, setCustomRollCount] = useState("");
  const [customNetWeight, setCustomNetWeight] = useState("");
  const [customGrossWeight, setCustomGrossWeight] = useState("");
  const [customDimensions, setCustomDimensions] = useState("");

  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("💬");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Inline action loading state per order id
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Sound preference
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem("arix_chat_sound") !== "false";
    } catch {
      return true;
    }
  });

  // Draggable FAB position
  const [fabPosition, setFabPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem("arix_chat_fab_pos_v2");
      if (saved) {
        const stored = JSON.parse(saved);
        const x = Number(stored?.x);
        const y = Number(stored?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          // A window resize can leave the saved spot outside the viewport
          return {
            x: Math.max(12, Math.min(window.innerWidth - 66, x)),
            y: Math.max(12, Math.min(window.innerHeight - 66, y)),
          };
        }
      }
    } catch {}
    return null;
  });

  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const handleResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // The software keyboard only shrinks the visual viewport on iOS, so the drawer
  // follows the measured height instead of 100dvh and keeps its header on screen.
  const [visualViewport, setVisualViewport] = useState<{ height: number; offsetTop: number } | null>(null);
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setVisualViewport({ height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) });
        const stream = streamRef.current;
        if (stream && nearBottomRef.current) stream.scrollTop = stream.scrollHeight;
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setVisualViewport(null);
    };
  }, [isOpen]);

  // The page behind the drawer must not scroll while the mobile sheet is open
  useEffect(() => {
    if (!isOpen || viewport.w > 600 || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen, viewport.w]);

  // Compute dynamic position of chat drawer anchored relative to the floating button
  const drawerStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (typeof window === "undefined" || viewport.w <= 600) return undefined;
    const W = viewport.w;
    const H = viewport.h;
    const margin = 16;
    const gap = 12;
    const dWidth = Math.min(410, W - margin * 2);
    const dHeight = Math.min(730, H - margin * 2);

    // Current coordinates of the 56x56 FAB button
    const fx = fabPosition ? fabPosition.x : W - 24 - 56;
    const fy = fabPosition ? fabPosition.y : H - 24 - 56;

    let top: number;
    if (fy < H / 2) {
      // FAB is in upper half: open downwards from FAB
      top = fy + 56 + gap;
      if (top + dHeight > H - margin) {
        top = Math.max(margin, H - margin - dHeight);
      }
    } else {
      // FAB is in lower half: open upwards from FAB
      top = fy - dHeight - gap;
      if (top < margin) {
        top = margin;
      }
    }

    let left: number;
    if (fx < W / 2) {
      // FAB is in left half: align with left side of FAB
      left = Math.max(margin, Math.min(fx, W - margin - dWidth));
    } else {
      // FAB is in right half: align with right side of FAB
      left = Math.max(margin, Math.min(fx + 56 - dWidth, W - margin - dWidth));
    }

    return {
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      bottom: "auto",
      right: "auto",
    };
  }, [fabPosition, viewport]);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number; moved: boolean } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const suppressFabClickRef = useRef(false);

  // Floating Toast Notification
  const [toastMessage, setToastMessage] = useState<{
    senderName: string;
    text: string;
    channel: ChatChannel;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const prevTotalUnreadRef = useRef<number>(0);
  const previousMessageIds = useRef<Map<string,string> | null>(null);
  const originalTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "AriX Order");
  const selectedChannelRef = useRef<ChatChannel | null>(null);
  selectedChannelRef.current = selectedChannel;
  const visibleChatRef = useRef(false); visibleChatRef.current = isOpen && channelView === "messages";
  const readThroughRef=useRef<Record<string,string>>({});

  useEffect(() => {
    const id=selectedChannel?.id || null;
    draftChannelRef.current=id;
    let draft:any={};
    try { draft=JSON.parse(localStorage.getItem(`arix-chat-draft:${currentUser.id}:${id}`)||'{}'); } catch {}
    setText(draft.text || ''); setAttachImage(draft.image || null); setAttachOrder(draft.order || null); setAttachProduct(draft.product || null); setReplyingTo(draft.reply || null);
  }, [selectedChannel?.id, currentUser.id]);
  useEffect(() => {
    const id=selectedChannel?.id;
    if(!id)return;
    const timer=setTimeout(()=>{try { localStorage.setItem(`arix-chat-draft:${currentUser.id}:${id}`,JSON.stringify({text,image:attachImage,order:attachOrder,product:attachProduct,reply:replyingTo})); } catch {}},200);
    return ()=>clearTimeout(timer);
  },[selectedChannel?.id,currentUser.id,text,attachImage,attachOrder,attachProduct,replyingTo]);

  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get('chat');if(requested){targetChannelIdRef.current=requested;setIsOpen(true);}},[]);
  // External open trigger sync
  useEffect(() => {
    if (isOpenExternal !== undefined) {
      setIsOpen(isOpenExternal);
    }
  }, [isOpenExternal]);

  // Handle external preset order / product (one-shot, non-repeating)
  useEffect(() => {
    if (presetOrder?.number) {
      const key = `${presetOrder.id || ""}_${presetOrder.number}_${presetOrder.palletNumber || ""}_${presetOrder.rollCount || ""}`;
      if (lastPresetOrderKeyRef.current !== key && lastPresetOrderKeyRef.current !== "dismissed:" + key) {
        lastPresetOrderKeyRef.current = key;
        try { const k=`arix-chat-draft:${currentUser.id}:orders-export`;const draft=JSON.parse(localStorage.getItem(k)||'{}');localStorage.setItem(k,JSON.stringify({...draft,order:presetOrder})); } catch {}
        setAttachOrder(presetOrder);
        setIsOpen(true);
        const orderChannel = channels.find((c) => c.id === "orders-export");
        if (orderChannel) {
          setSelectedChannel(orderChannel);
        } else {
          targetChannelIdRef.current = "orders-export";
        }
        if (onClearPreset) onClearPreset();
      }
    }
  }, [presetOrder]);

  useEffect(() => {
    if (presetProduct?.name) {
      const key = `${presetProduct.id || ""}_${presetProduct.name}`;
      if (lastPresetProductKeyRef.current !== key) {
        lastPresetProductKeyRef.current = key;
        try {
          const draftKey = `arix-chat-draft:${currentUser.id}:${presetOrder ? "orders-export" : "general"}`;
          const draft = JSON.parse(localStorage.getItem(draftKey) || '{}');
          localStorage.setItem(draftKey, JSON.stringify({ ...draft, product: presetProduct }));
        } catch {}
        setAttachProduct(presetProduct);
        setIsOpen(true);
        if (!presetOrder) {
          const genChannel = channels.find((c) => c.id === "general");
          if (genChannel) {
            setSelectedChannel(genChannel);
          } else {
            targetChannelIdRef.current = "general";
          }
        }
        setTimeout(() => {
          inputRef.current?.focus();
        }, 150);
        if (onClearPreset) onClearPreset();
      }
    }
  }, [presetProduct, presetOrder]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem("arix_chat_sound", next ? "true" : "false");
    } catch {}
    if (next) playNotificationChime();
  };

  // Draggable Pointer Event Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = fabRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : (window.innerWidth - 78);
    const currentY = rect ? rect.top : (window.innerHeight - 78);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentX,
      initY: currentY,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    if (!dragStartRef.current.moved && Math.hypot(deltaX, deltaY) > 6) {
      dragStartRef.current.moved = true;
      setIsDragging(true);
    }

    if (dragStartRef.current.moved) {
      const nextX = Math.max(12, Math.min(window.innerWidth - 66, dragStartRef.current.initX + deltaX));
      const nextY = Math.max(12, Math.min(window.innerHeight - 66, dragStartRef.current.initY + deltaY));
      setFabPosition({ x: nextX, y: nextY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStartRef.current) return;
    const wasMoved = dragStartRef.current.moved;
    dragStartRef.current = null;
    setIsDragging(false);

    if (wasMoved && fabPosition) {
      try {
        localStorage.setItem("arix_chat_fab_pos_v2", JSON.stringify(fabPosition));
      } catch {}
    } else if (!wasMoved) {
      suppressFabClickRef.current = true;
      const nextOpen = !isOpen;
      setIsOpen(nextOpen);
      if (!nextOpen && onCloseExternal) onCloseExternal();
    }
  };

  const handleFabClick = () => {
    if (suppressFabClickRef.current) {
      suppressFabClickRef.current = false;
      return;
    }
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen && onCloseExternal) onCloseExternal();
  };

  // Fetch channels, direct messages and full contacts directory
  const loadChannels = useCallback(async () => {
    try {
      const raw = await api<any>("/api/orders/chat/channels");
      const data = raw?.data ?? raw;
      if (data && (Array.isArray(data.channels) || Array.isArray(data.directMessages))) {
        const withAvatar = (list: any[]) => (list || []).map((item) => ({ ...item, avatar: item.avatarUrl || item.avatar || "" }));
        const nextChannels: ChatChannel[] = withAvatar(data.channels);
        const nextDms: ChatChannel[] = withAvatar(data.directMessages);
        const nextContacts: ChatContact[] = withAvatar(data.allContacts);
        const nextTotalUnread: number = Number(data.totalUnread) || 0;

        setChannels(nextChannels);
        setDirectMessages(nextDms);
        setAllContacts(nextContacts);

        if (targetChannelIdRef.current) {
          const target = [...nextChannels, ...nextDms].find((c) => c.id === targetChannelIdRef.current);
          if (target) {
            setSelectedChannel(target);
            targetChannelIdRef.current = null;
          }
        }

        if (selectedChannelRef.current) {
          const fresh = [...nextChannels, ...nextDms].find((c) => c.id === selectedChannelRef.current?.id);
          if (fresh) {
            setSelectedChannel((prev) => prev ? {
              ...prev,
              name: fresh.name,
              isOnline: fresh.isOnline,
              lastSeenText: fresh.lastSeenText,
              lastActivityAt: fresh.lastActivityAt,
              avatar: fresh.avatar,
              about: fresh.about,
              muted: fresh.muted,
              pinned: fresh.pinned,
              archived: fresh.archived,
            } : prev);
          }
        }

        if (previousMessageIds.current) {

          const all = [...nextChannels, ...nextDms];
          const unreadCh = all.find((c) => !c.muted && (c.unreadCount || 0) > 0 && c.lastMessage && previousMessageIds.current?.get(c.id)!==c.lastMessage.id);
          if (unreadCh && unreadCh.lastMessage) {
            if (soundEnabled) playNotificationChime();
            if (!isOpen || selectedChannelRef.current?.id !== unreadCh.id) {
              setToastMessage({
                senderName: unreadCh.lastMessage.senderName,
                text: unreadCh.lastMessage.text,
                channel: unreadCh,
              });


            }
          }
        }
        previousMessageIds.current=new Map([...nextChannels,...nextDms].map(c=>[c.id,c.lastMessage?.id || ""]));
        prevTotalUnreadRef.current = nextTotalUnread;
        setTotalUnread(nextTotalUnread);
      }
    } catch {
      setChatError("Sohbet listesi yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    }
  }, [api, soundEnabled, isOpen]);

  const loadTaskStats = useCallback(async () => {
    try {
      const raw = await api<any>("/api/orders/chat/tasks");
      const data = raw?.data ?? raw;
      setTaskStats({ openCount: Number(data?.openCount) || 0, overdueCount: Number(data?.overdueCount) || 0 });
    } catch {}
  }, [api]);
  useEffect(() => { if (isOpen) void loadTaskStats(); }, [isOpen, loadTaskStats]);

  // Update document title
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) AriX Order · Ekip Yazışması`;
    } else {
      document.title = originalTitleRef.current;
    }
  }, [totalUnread]);

  useEffect(() => () => {
    if (typeof document !== "undefined") document.title = originalTitleRef.current;
  }, []);

  // Dismiss toast after 6s
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 6000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const typingHideTimer = useRef<any>(null);
  const showTyping = useCallback((names: string[]) => {
    setTypingNames(names);
    if (typingHideTimer.current) clearTimeout(typingHideTimer.current);
    typingHideTimer.current = names.length ? setTimeout(() => setTypingNames([]), 6000) : null;
  }, []);

  // Fetch messages for active channel
  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    const sequence = before ? requestSequence.current : ++requestSequence.current;
    const searchTerm=searchRef.current;
    const stream = streamRef.current;
    const oldHeight = stream?.scrollHeight || 0;
    try {
      const raw = await api<any>(`/api/orders/chat/messages?channelId=${encodeURIComponent(channelId)}&limit=60&search=${encodeURIComponent(searchTerm)}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      const data = raw?.data ?? raw;
      if (selectedChannelRef.current?.id !== channelId || searchTerm!==searchRef.current || (!before && sequence !== requestSequence.current)) return;
      if (Array.isArray(data?.messages)) {
        setMessages(previous => {
          const merged = new Map((searchTerm && !before ? [] : previous).filter(m => m.channelId === channelId && !m.id.startsWith('temp-')).map(m => [m.id,m]));
          data.messages.forEach((m: ChatMessage) => merged.set(m.id,m));
          return [...merged.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
        });
        if(before || !stream?.querySelector("[id^=msg-]")) setHasMore(Boolean(data.hasMore));
        showTyping((data.typing || []).map((u:any)=>u.name));
        setPinnedMessageId(data.pinnedMessageId || null);
        setPinnedMessageInfo(data.pinnedMessage || null);
        setChatError("");
        if(before) requestAnimationFrame(()=>{if(stream && selectedChannelRef.current?.id===channelId)stream.scrollTop += stream.scrollHeight-oldHeight;});
        else if(visibleChatRef.current && !searchTerm && document.visibilityState === 'visible' && nearBottomRef.current && data.messages.length) {
          const messageId=data.messages[data.messages.length-1].id;
          if(readThroughRef.current[channelId]!==messageId){await api('/api/orders/chat/read',{method:'POST',body:JSON.stringify({channelId,messageId})});readThroughRef.current[channelId]=messageId;void loadChannels();}
        }
      }
    } catch { if(selectedChannelRef.current?.id===channelId)setChatError("Bağlantı kurulamadı. Mesajlarınız korunuyor; yeniden denenecek."); }
  }, [api, loadChannels, showTyping]);

  const loadChannelsRef = useRef(loadChannels); loadChannelsRef.current = loadChannels;
  const loadMessagesRef = useRef(loadMessages); loadMessagesRef.current = loadMessages;
  const apiRef = useRef(api); apiRef.current = api;

  useEffect(()=>{
    let channelTimer:any; let messageTimer:any;
    const scheduleChannels=()=>{
      if(document.visibilityState!=='visible' || channelTimer)return;
      channelTimer=setTimeout(()=>{channelTimer=undefined;void loadChannelsRef.current();},400);
    };
    const scheduleMessages=()=>{
      if(document.visibilityState!=='visible' || messageTimer)return;
      messageTimer=setTimeout(()=>{messageTimer=undefined;const current=selectedChannelRef.current?.id;if(current)void loadMessagesRef.current(current);},400);
    };
    const events=new EventSource('/api/orders/chat/events');
    events.onmessage=event=>{
      let change:any;
      try{change=JSON.parse(event.data);}catch{return;}
      const activeId=selectedChannelRef.current?.id;
      if(change.type==='typing'){
        if(change.channelId===activeId)showTyping((change.typing||[]).map((u:any)=>u.name));
        return;
      }
      if(change.type==='message'){
        const incoming=change.message;
        if(incoming && activeId && change.channelId===activeId && !(searchRef.current)){
          setMessages(prev=>prev.some(m=>m.id===incoming.id)?prev:[...prev,incoming].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
          if(visibleChatRef.current && document.visibilityState==='visible' && nearBottomRef.current && readThroughRef.current[activeId]!==incoming.id){
            readThroughRef.current[activeId]=incoming.id;
            void apiRef.current('/api/orders/chat/read',{method:'POST',body:JSON.stringify({channelId:activeId,messageId:incoming.id})}).catch(()=>{});
          }
        }
        scheduleChannels();
        return;
      }
      if(change.type==='connected'){setChatError('');scheduleChannels();scheduleMessages();return;}
      if(change.channelId===activeId)scheduleMessages();
      scheduleChannels();
    };
    // A reconnect means we may have missed events
    events.onopen=()=>{scheduleChannels();scheduleMessages();};
    events.onerror=()=>{if(document.visibilityState==='visible')setChatError('Canlı bağlantı kesildi, yeniden bağlanılıyor…');};
    const refresh=()=>{void loadChannelsRef.current();const current=selectedChannelRef.current?.id;if(current)void loadMessagesRef.current(current);flushOutboxRef.current();};
    window.addEventListener('online',refresh);
    return ()=>{
      events.close();
      window.removeEventListener('online',refresh);
      clearTimeout(channelTimer);
      clearTimeout(messageTimer);
      if(typingHideTimer.current)clearTimeout(typingHideTimer.current);
    };
  },[showTyping]);
  useEffect(()=>{const current=selectedChannel?.id;if(!current)return;setTypingNames([]);const timer=setTimeout(()=>{setMessages([]);void loadMessages(current);},250);return ()=>clearTimeout(timer);},[messageSearch,selectedChannel?.id,loadMessages]);
  // Any path that switches the channel must land in the message view, never in the vault
  useEffect(() => {
    setChannelView("messages");
    setReplyingTo(null);
    renderLimitRef.current = 200;
    setRenderLimit(200);
  }, [selectedChannel?.id]);

  // Browsers keep audio contexts suspended until a user gesture
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getChimeContext();
        if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const getDisplayPresence = (ch: { isOnline?: boolean; lastActivityAt?: string | null; lastSeenText?: string }) => {
    if (ch.isOnline) return "● çevrimiçi";
    if (ch.lastActivityAt) {
      const d = new Date(ch.lastActivityAt);
      if (!isNaN(d.getTime())) {
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        if (diffMs < 90000) return "● çevrimiçi";
        const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const isToday = d.toDateString() === now.toDateString();
        const yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === yest.toDateString();
        if (isToday) return `son görülme: bugün ${time}`;
        if (isYesterday) return `son görülme: dün ${time}`;
        return `son görülme: ${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} ${time}`;
      }
    }
    return ch.lastSeenText || "çevrimdışı";
  };

  // Chat presence ping while open
  useEffect(() => {
    if (!isOpen) {
      void api("/api/orders/chat/presence", {
        method: "POST",
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
      return;
    }
    const ping = (active = true) => {
      if (document.visibilityState === "visible") {
        void api("/api/orders/chat/presence", {
          method: "POST",
          body: JSON.stringify({ active }),
        }).catch(() => {});
      }
    };
    ping(true);
    const timer = setInterval(() => ping(true), 15000);

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        ping(false);
      } else {
        ping(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      void api("/api/orders/chat/presence", {
        method: "POST",
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
    };
  }, [isOpen, api]);

  // Polling channels
  useEffect(() => {
    loadChannels();
    const timer = setInterval(()=>{if(document.visibilityState === "visible")void loadChannels();}, 30000);
    return () => clearInterval(timer);
  }, [loadChannels]);

  // Polling messages when channel is open
  useEffect(() => {
    if (!isOpen || !selectedChannel) return;
    loadMessages(selectedChannel.id);
    nearBottomRef.current = true;
    setMessageSearch("");
    setMessages([]);
    setHasMore(false);

    const timer = setInterval(() => {
      if(document.visibilityState === "visible") loadMessages(selectedChannel.id);
    }, 15000);

    return () => clearInterval(timer);
  }, [isOpen, selectedChannel?.id, loadMessages]);

  // Scroll to bottom
  useEffect(() => {
    if (nearBottomRef.current && selectedChannel && channelView === "messages" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedChannel, channelView]);

  // activeOrder auto-attach removed: user explicitly attaches orders via + or Ekiple Konus

  // Handle Voice Recording (Telsiz / Sesli Not)
  const stopRecorderTracks = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      try { recorder.stream.getTracks().forEach((track) => track.stop()); } catch {}
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch {} }
    }
    audioChunksRef.current = [];
  }, []);

  const startVoiceRecording = async () => {
    if (mediaRecorderRef.current) stopRecorderTracks();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      recordingTimerRef.current = setInterval(() => {
        const next = recordingSecondsRef.current + 1;
        recordingSecondsRef.current = next;
        setRecordingSeconds(next);
        if (next >= 300) void stopAndSendVoiceRecording();
      }, 1000);
    } catch (err) {
      alert("Mikrofon izni alınamadı. Lütfen tarayıcı ayarlarından mikrofon erişimine izin verin.");
    }
  };

  const cancelVoiceRecording = () => {
    stopRecorderTracks();
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
  };

  const stopAndSendVoiceRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !selectedChannel) return;
    const channelId = selectedChannel.id;
    const duration = recordingSecondsRef.current;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaRecorderRef.current = null;
    const chunks = audioChunksRef.current;
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;

    const stopped = new Promise<Blob>((resolve) => {
      const finish = () => {
        try { recorder.stream.getTracks().forEach((track) => track.stop()); } catch {}
        // The recorder flushes its last chunk while stopping, so read the live buffer here
        resolve(new Blob(chunks.length ? chunks : audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.onstop = finish;
      try {
        if (recorder.state === "inactive") finish();
        else recorder.stop();
      } catch {
        finish();
      }
    });

    try {
      setLoading(true);
      const blob = await stopped;
      audioChunksRef.current = [];
      if (!blob.size) throw new Error("empty recording");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const upload = await api<any>("/api/orders/chat/audio", {
        method: "POST",
        body: JSON.stringify({ data: data.replace(/;codecs=[^;,]+(?=;base64)/, "") }),
      });
      const url = upload?.data?.url || upload?.url;
      if (!url) throw new Error("audio upload failed");
      const id = crypto.randomUUID();
      const entry = { id, payload: { clientMessageId: id, channelId, text: "", audioUrl: url, audioDuration: duration, orderReference: attachOrder, productReference: attachProduct, replyToReference: replyingTo } };
      saveOutbox([...outboxRef.current, entry]);
      if (selectedChannelRef.current?.id === channelId) {
        setReplyingTo(null);
        setAttachOrder(null);
        setAttachProduct(null);
      }
      await sendQueuedMessage(entry);
    } catch {
      alert("Sesli mesaj gönderilemedi.");
    } finally {
      setLoading(false);
    }
  };

  // Recording belongs to one channel and one open panel: stop it as soon as either changes
  const cancelVoiceRef = useRef(cancelVoiceRecording); cancelVoiceRef.current = cancelVoiceRecording;
  useEffect(() => {
    if (!isOpen) cancelVoiceRef.current();
  }, [isOpen]);
  useEffect(() => {
    cancelVoiceRef.current();
  }, [selectedChannel?.id]);
  useEffect(() => () => { stopRecorderTracks(); }, [stopRecorderTracks]);

  // Image Upload handler
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Lütfen bir resim dosyası seçin.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      alert("Fotoğraf boyutu en fazla 6 MB olabilir.");
      return;
    }

    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await api<any>("/api/orders/chat/upload", {
          method: "POST",
          body: JSON.stringify({ data: base64Data }),
        });
        const url = res?.data?.url || res?.url;
        if (url) {
          setAttachImage(url);
        }
      } catch (err) {
        alert("Fotoğraf yüklenemedi.");
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Paste image handler in composer
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setIsUploadingImage(true);
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const res = await api<any>("/api/orders/chat/upload", {
                method: "POST",
                body: JSON.stringify({ data: reader.result }),
              });
              const url = res?.data?.url || res?.url;
              if (url) setAttachImage(url);
            } catch {
              alert("Resim yapıştırılamadı.");
            } finally {
              setIsUploadingImage(false);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  // Serial outbox delivery: entries never race, retries resume automatically
  const sendChainRef = useRef<Promise<any>>(Promise.resolve());
  const inflightRef = useRef<Set<string>>(new Set());
  const deliverOutboxEntry = async (queued:any) => {
    let entry=queued;
    try {
      if(entry.voiceData && !entry.payload.audioUrl) {
        const upload=await api<any>('/api/orders/chat/audio',{method:'POST',body:JSON.stringify({data:String(entry.voiceData).replace(/;codecs=[^;,]+(?=;base64)/, "")})});
        const url=upload?.data?.url || upload?.url;
        if(!url)throw new Error('Ses yüklenemedi');
        entry={...entry,voiceData:undefined,payload:{...entry.payload,audioUrl:url}};
        saveOutbox(outboxRef.current.map(m=>m.id===entry.id?entry:m));
      }
      const raw=await api<any>('/api/orders/chat/messages' ,{method:'POST',body:JSON.stringify(entry.payload)});
      const message=raw?.data ?? raw;
      if(!message?.id)throw new Error('Yanıt alınamadı');
      saveOutbox(outboxRef.current.filter(m=>m.id!==entry.id));
      if(selectedChannelRef.current?.id===entry.payload.channelId) {
        setMessages(previous=>[...previous.filter(m=>m.id!==message.id),message].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
        nearBottomRef.current=true;
      }
      setChatError(''); void loadChannels();
      return message;
    } catch {
      setChatError('Mesaj gönderilemedi. Aşağıdaki bekleyen mesajdan yeniden deneyin.');
      return null;
    }
  };
  const sendQueuedMessage = (entry:any) => {
    if(!entry?.id || inflightRef.current.has(entry.id))return Promise.resolve(null);
    inflightRef.current.add(entry.id);
    const run=sendChainRef.current.then(()=>deliverOutboxEntry(entry),()=>deliverOutboxEntry(entry)).finally(()=>inflightRef.current.delete(entry.id));
    sendChainRef.current=run;
    return run;
  };
  const flushOutbox = useCallback(() => {
    for(const entry of outboxRef.current){
      if(entry?.id && !inflightRef.current.has(entry.id))void sendQueuedMessage(entry);
    }
  }, []);
  const flushOutboxRef = useRef(flushOutbox); flushOutboxRef.current = flushOutbox;
  // Messages left in the outbox from a previous session go out as soon as the app loads
  useEffect(() => { flushOutboxRef.current(); }, []);

  const handleSendMessage = async (e?:React.FormEvent) => {
    e?.preventDefault();
    if(!selectedChannel)return;
    if(!text.trim() && !attachImage && !attachOrder && !attachProduct)return;
    const id=crypto.randomUUID();
    const entry={id,payload:{clientMessageId:id,channelId:selectedChannel.id,text:text.trim(),imageUrl:attachImage,orderReference:attachOrder,productReference:attachProduct,replyToReference:replyingTo}};
    saveOutbox([...outboxRef.current,entry]);
    try{localStorage.removeItem(`arix-chat-draft:${currentUser.id}:${selectedChannel.id}`);}catch{}
    setText('');setAttachImage(null);setAttachOrder(null);setAttachProduct(null);setReplyingTo(null);
    await sendQueuedMessage(entry);
  };

  // Pin / Unpin message
  const handleTogglePin = async (messageId: string) => {
    if (!selectedChannel) return;
    try {
      const res = await api<any>("/api/orders/chat/pin", {
        method: "POST",
        body: JSON.stringify({ channelId: selectedChannel.id, messageId }),
      });
      const nextPinId = res?.pinnedMessageId ?? null;
      setPinnedMessageId(nextPinId);
      setPinnedMessageInfo(null);
      setMessages((prev) =>
        prev.map((m) => ({ ...m, isPinned: m.id === nextPinId }))
      );
    } catch { setChatError("Sabitleme işlemi yapılamadı."); }
  };

  // Inline ERP Actions Execution from chat
  const handleInlineOrderAction = async (orderId: string, orderNumber: string, action: "approve" | "prepared" | "despatch") => {
    if (!selectedChannel) return;
    setActionLoadingId(`${orderId}-${action}`);
    try {
      if (action === "approve") {
        await api(`/api/orders/${orderId}/approval-form/approve`, { method: "POST", body: JSON.stringify({}) });
      } else if (action === "prepared") {
        await api(`/api/orders/${orderId}/prepared`, { method: "POST", body: JSON.stringify({}) });
      } else if (action === "despatch") {
        await api(`/api/orders/${orderId}/despatch`, { method: "POST", body: JSON.stringify({}) });
      }

      const actionText = action === "approve"
        ? `✓ #${orderNumber} proforma formu onaylandı.`
        : action === "prepared"
        ? `📦 #${orderNumber} paletlendi ve sevkiyata hazırlandı.`
        : `🚚 #${orderNumber} sevk edildi.`;

      // Post status notification into the chat
      await api("/api/orders/chat/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: selectedChannel.id,
          text: actionText,
          orderReference: { id: orderId, number: orderNumber },
        }),
      });

      loadMessages(selectedChannel.id);
      loadChannels();
    } catch (err: any) {
      alert(`İşlem gerçekleştirilemedi: ${err?.message || "Yetki veya bağlantı hatası"}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Create new group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const raw = await api<any>("/api/orders/chat/channels", {
        method: "POST",
        body: JSON.stringify({
          name: newGroupName.trim(),
          icon: newGroupIcon,
          description: newGroupDesc.trim(),
        }),
      });
      const channel = raw?.data ?? raw;
      setChannels((prev) => [...prev, channel]);
      setNewGroupOpen(false);
      setNewGroupName("");
      setNewGroupDesc("");
      openChannel(channel);
    } catch (err) {
      alert("Grup oluşturulamadı.");
    }
  };

  const openChannel = (channel: ChatChannel) => {
    setSelectedChannel(channel);
    setChannelView("messages");
    setReplyingTo(null);
    loadMessages(channel.id);

  };

  const startDmWithContact = (contact: ChatContact) => {
    setNewChatModalOpen(false);
    const channel: ChatChannel = {
      ...contact,
      id: contact.id,
      name: contact.name,
      type: "dm",
      icon: contact.icon || "👤",
      role: contact.role,
      email: contact.email,
      targetUserId: contact.targetUserId,
      isOnline: contact.isOnline,
      lastSeenText: contact.lastSeenText,
    };
    openChannel(channel);
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  // Filtered contacts in "Yeni Sohbet" modal
  const filteredAllContacts = useMemo(() => {
    const term = contactSearch.toLowerCase();
    return allContacts.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      (c.role || "").toLowerCase().includes(term) ||
      (c.email || "").toLowerCase().includes(term)
    );
  }, [allContacts, contactSearch]);

  // Filtered orders in order picker
  const filteredOrders = useMemo(() => {
    const term = orderSearch.toLowerCase();
    return orders.filter((o) =>
      (o.number || "").toLowerCase().includes(term) ||
      (o.customerName || "").toLowerCase().includes(term)
    );
  }, [orders, orderSearch]);

  // Filtered products in product picker
  const filteredProducts = useMemo(() => {
    const term = productSearch.toLowerCase();
    return products.filter((p) =>
      (p.name || "").toLowerCase().includes(term) ||
      (p.code || "").toLowerCase().includes(term)
    );
  }, [products, productSearch]);

  const listedChannels = useMemo(
    () => [...directMessages, ...channels]
      .filter(c => listFilter === "archived" ? c.archived : !c.archived)
      .filter(c => listFilter !== "unread" || (c.unreadCount || 0) > 0)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.lastMessage?.createdAt || "").localeCompare(a.lastMessage?.createdAt || "")),
    [directMessages, channels, listFilter]
  );
  const filteredChannels = useMemo(() => {
    const term = search.toLowerCase();
    return listedChannels
      .filter(c => activeTab !== "groups" || c.type === "group")
      .filter((c) =>
        c.name.toLowerCase().includes(term) ||
        (c.role || "").toLowerCase().includes(term) ||
        (c.description || "").toLowerCase().includes(term)
      );
  }, [listedChannels, activeTab, search]);

  // Pinned message object
  const pinnedMessage = messages.find((m) => m.id === pinnedMessageId) || (pinnedMessageInfo?.id === pinnedMessageId ? pinnedMessageInfo : null);

  // Media Vault items in current channel
  const vaultPhotos = messages.filter((m) => Boolean(m.imageUrl));
  const vaultAudio = messages.filter((m) => Boolean(m.audioUrl));
  const vaultOrders = messages.filter((m) => Boolean(m.orderReference?.number));

  // Long threads render in a window; older rows appear on demand instead of on every keystroke
  const renderedMessages = messages.length > renderLimit ? messages.slice(-renderLimit) : messages;
  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (messages.length > renderLimitRef.current) {
      renderLimitRef.current = messages.length;
      setRenderLimit(messages.length);
      window.setTimeout(() => {
        document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  };

  const isManagerOrSales = currentUser.role?.toLowerCase().includes("sahib") ||
    currentUser.role?.toLowerCase().includes("yönet") ||
    currentUser.role?.toLowerCase().includes("satış") ||
    currentUser.role?.toLowerCase().includes("ihracat");

  const isWarehouseOrManager = isManagerOrSales ||
    currentUser.role?.toLowerCase().includes("depo") ||
    currentUser.role?.toLowerCase().includes("sevkiyat");

  return (
    <>
      {/* Toast Alert */}
      {toastMessage && !isOpen && (
        <div
          className="team-chat-toast"
          onClick={() => {
            openChannel(toastMessage.channel);
            setIsOpen(true);
          }}
          role="alert"
        >
          <div
            className="team-chat-toast-avatar"
            style={{ background: getAvatarGradient(toastMessage.senderName) }}
          >
            {getInitials(toastMessage.senderName)}
          </div>
          <div className="team-chat-toast-content">
            <div className="team-chat-toast-header">
              <strong>{toastMessage.senderName}</strong>
              <small>{toastMessage.channel.name}</small>
            </div>
            <p className="team-chat-toast-text">{toastMessage.text}</p>
          </div>
          <button
            type="button"
            className="team-chat-toast-close"
            onClick={(e) => {
              e.stopPropagation();
              setToastMessage(null);
            }}
            aria-label="Kapat"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* DRAGGABLE ARIX FAB BUTTON */}
      <button
        ref={fabRef}
        type="button"
        className={`team-chat-fab ${isOpen ? "is-active" : ""} ${totalUnread > 0 ? "has-unread" : ""} ${isDragging ? "is-dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleFabClick}
        style={fabPosition ? {
          left: `${fabPosition.x}px`,
          top: `${fabPosition.y}px`,
          bottom: "auto",
          right: "auto",
        } : undefined}
        aria-label="AriX Ekip Sohbeti"
        title="AriX Ekip Sohbeti (Sürükleyip istediğiniz yere bırakabilirsiniz)"
      >
        <div className="team-chat-fab-pulse" />
        
        {/* AriX Custom Floating Speech Emblem */}
        <div className="team-chat-fab-emblem">
          <svg viewBox="0 0 60 60" width="56" height="56" fill="none">
            <defs>
              <linearGradient id="arixFabBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#4f7ddc" />
              </linearGradient>
            </defs>
            {/* Elegant Speech Bubble Shape */}
            <path
              d="M30 6C16.745 6 6 16.745 6 30C6 34.62 7.305 38.935 9.56 42.6L7 52.5L17.225 50.15C20.89 52.585 25.285 54 30 54C43.255 54 54 43.255 54 30C54 16.745 43.255 6 30 6Z"
              fill="#ffffff"
              stroke="url(#arixFabBorderGrad)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Centered geometric AriX Logo */}
            <g transform="translate(7.5, 8.5) scale(0.40)">
              <polygon points="30,80 46,20 70,20 54,80" fill="#34d399" />
              <path d="M62 40 L84 62" stroke="#4f7ddc" strokeWidth={10} strokeLinecap="round" />
              <path d="M84 40 L62 62" stroke="#4f7ddc" strokeWidth={10} strokeLinecap="round" />
            </g>
          </svg>
        </div>

        {totalUnread > 0 && (
          <span className="team-chat-fab-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
        )}
      </button>

      {/* CHAT DRAWER */}
      {isOpen && (
        <aside className="team-chat-drawer" role="dialog" aria-label="Ekip Sohbet Penceresi" style={viewport.w <= 600 && visualViewport ? ({ "--arix-chat-vh": `${visualViewport.height}px`, "--arix-chat-top": `${visualViewport.offsetTop}px` } as React.CSSProperties) : drawerStyle}>
          {/* Top AriX Gradient Strip */}
          <div className="team-chat-header-accent" />

          {/* Header */}
          <header className={selectedChannel ? "wa-chat-header" : "wa-header"}>
            {selectedChannel ? (
              <>
                <button
                  type="button"
                  className="wa-back-btn"
                  onClick={() => {
                    setSelectedChannel(null);
                    setReplyingTo(null);
                    setShowInChatSearch(false);
                    setMessageSearch("");
                  }}
                  aria-label="Geri"
                  title="Geri"
                >
                  <ChevronLeft size={24} />
                  {totalUnread > 0 && <span className="wa-back-badge">{totalUnread}</span>}
                </button>

                <div
                  className="wa-chat-header-center"
                  role="button"
                  tabIndex={0}
                  onClick={() => setInfoOpen("channel")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setInfoOpen("channel");
                    }
                  }}
                >
                  {selectedChannel.type === "dm" ? (
                    <div
                      className="team-chat-avatar sm"
                      style={{ background: getAvatarGradient(selectedChannel.name) }}
                    >
                      {selectedChannel.avatar ? <img src={selectedChannel.avatar} alt="" /> : <span>{selectedChannel.id.startsWith("assistant:") ? "🤖" : getInitials(selectedChannel.name)}</span>}
                      {selectedChannel.isOnline && <span className="team-chat-status-dot online" />}
                    </div>
                  ) : (
                    <span className="team-chat-channel-icon">{selectedChannel.icon || "💬"}</span>
                  )}

                  <div className="wa-chat-header-meta">
                    <strong className="wa-chat-title">{selectedChannel.name}</strong>
                    <small className={`wa-chat-subtitle ${selectedChannel.isOnline ? "is-online" : ""}`}>
                      {selectedChannel.type === "dm"
                        ? getDisplayPresence(selectedChannel)
                        : "Grup bilgisi için dokunun"}
                    </small>
                  </div>
                </div>

                <div className="wa-chat-header-actions">
                  <input
                    type="file"
                    ref={documentInputRef}
                    hidden
                    accept=".pdf,.xlsx,.xls,.docx,.csv,.txt"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file || !selectedChannel) return;
                      if (file.size > 10000000) {
                        setChatError("Dosya en fazla 10 MB olabilir.");
                        return;
                      }
                      const channelId = selectedChannel.id;
                      try {
                        const data = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(String(reader.result));
                          reader.onerror = reject;
                          reader.readAsDataURL(file);
                        });
                        const response = await api<any>("/api/orders/chat/files", {
                          method: "POST",
                          body: JSON.stringify({ name: file.name, data }),
                        });
                        const ref = response?.data ?? response;
                        const id = crypto.randomUUID();
                        const entry = { id, payload: { channelId, clientMessageId: id, text: "", fileReference: ref } };
                        saveOutbox([...outboxRef.current, entry]);
                        await sendQueuedMessage(entry);
                      } catch {
                        setChatError("Dosya yüklenemedi. Tekrar deneyin.");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="wa-header-tool-btn"
                    title="Belge gönder (PDF, Excel, Word)"
                    aria-label="Belge gönder"
                    onClick={() => documentInputRef.current?.click()}
                  >
                    <FileText size={15} />
                  </button>
                  <button
                    type="button"
                    className={`wa-header-tool-btn ${showInChatSearch ? "active" : ""}`}
                    title="Mesajlarda ara"
                    aria-label="Mesajlarda ara"
                    onClick={() => setShowInChatSearch((prev) => {
                      if (prev) setMessageSearch("");
                      return !prev;
                    })}
                  >
                    <Search size={15} />
                  </button>
                  <button
                    type="button"
                    className={`wa-header-tool-btn ${channelView === "mediaVault" ? "active" : ""}`}
                    onClick={() => setChannelView((prev) => (prev === "messages" ? "mediaVault" : "messages"))}
                    title={channelView === "mediaVault" ? "Mesaj akışına dön" : "Medya Galerisi"}
                  >
                    <FolderOpen size={15} />
                  </button>
                  <button
                    type="button"
                    className="wa-header-tool-btn close"
                    onClick={() => {
                      setIsOpen(false);
                      if (onCloseExternal) onCloseExternal();
                    }}
                    title="Kapat"
                  >
                    <X size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="wa-top-row">
                  <div className="wa-brand-pill">
                    <AriXLogo className="team-chat-header-arix-logo" />
                    <span className="wa-brand-title">AriX</span>
                  </div>
                  <div className="wa-top-actions">
                    <button
                      type="button"
                      className="wa-icon-btn compose"
                      onClick={() => {
                        setContactSearch("");
                        setNewChatModalOpen(true);
                      }}
                      title="Yeni Sohbet"
                      aria-label="Yeni Sohbet"
                    >
                      <SquarePen size={17} />
                    </button>
                    <button
                      type="button"
                      className="wa-icon-btn"
                      onClick={() => {
                        setNewGroupName("");
                        setNewGroupDesc("");
                        setNewGroupOpen(true);
                      }}
                      title="Yeni Ekip Grubu"
                      aria-label="Yeni Ekip Grubu"
                    >
                      <Users size={17} />
                    </button>
                    <button
                      type="button"
                      className="wa-icon-btn"
                      onClick={() => setTasksOpen(true)}
                      title="Görevler"
                      aria-label="Görevler"
                      style={{ position: "relative" }}
                    >
                      <ClipboardList size={17} />
                      {taskStats.openCount > 0 && (
                        <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: taskStats.overdueCount ? "#dc2626" : "#0ea5e9", color: "#fff", fontSize: 10, lineHeight: "16px", textAlign: "center", padding: "0 3px" }}>
                          {taskStats.openCount > 99 ? "99+" : taskStats.openCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="wa-icon-btn close"
                      onClick={() => {
                        setIsOpen(false);
                        if (onCloseExternal) onCloseExternal();
                      }}
                      title="Kapat"
                      aria-label="Kapat"
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>

                <div className="wa-title-row">
                  <h1 className="wa-large-title">
                    {activeTab === "settings" ? "Ayarlar" : activeTab === "groups" ? "Gruplar" : "Sohbetler"}
                  </h1>
                </div>

                {activeTab !== "settings" && (
                  <>
                    <div className="wa-search-capsule">
                      <Search size={15} className="wa-search-icon" />
                      <input
                        type="text"
                        placeholder="Ara"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button type="button" className="wa-search-clear" onClick={() => setSearch("")}>
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="wa-filter-chips">
                      <button
                        type="button"
                        className={`wa-filter-chip ${listFilter === "all" && activeTab === "dms" ? "active" : ""}`}
                        onClick={() => { setActiveTab("dms"); setListFilter("all"); }}
                      >
                        Tümü
                      </button>
                      <button
                        type="button"
                        className={`wa-filter-chip ${listFilter === "unread" ? "active" : ""}`}
                        onClick={() => { setActiveTab("dms"); setListFilter("unread"); }}
                      >
                        Okunmamış
                      </button>
                      <button
                        type="button"
                        className={`wa-filter-chip ${activeTab === "groups" ? "active" : ""}`}
                        onClick={() => { setActiveTab("groups"); setListFilter("all"); }}
                      >
                        Gruplar
                      </button>
                      <button
                        type="button"
                        className={`wa-filter-chip ${listFilter === "orders" ? "active" : ""}`}
                        onClick={() => {
                          const orderCh = channels.find((c) => c.id === "orders-export") || channels[0];
                          if (orderCh) setSelectedChannel(orderCh);
                        }}
                      >
                        📦 Siparişler
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </header>
          {infoOpen && (
            <ChatInfo
              api={api}
              channel={infoOpen === "channel" ? selectedChannel : null}
              user={currentUser}
              onClose={() => setInfoOpen(null)}
              onMedia={() => {
                setInfoOpen(null);
                setChannelView("mediaVault");
              }}
              onUpdated={() => void loadChannels()}
            />
          )}
          {menuMessage && (
            <ChatMessageMenu
              message={menuMessage}
              channels={[...channels, ...allContacts]}
              currentUser={currentUser}
              api={api}
              onClose={() => setMenuMessage(null)}
              onChanged={(message) => {
                if (message.channelId === selectedChannel?.id) {
                  setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
                }
                if (selectedChannel) void loadMessages(selectedChannel.id);
              }}
              onReply={() =>
                setReplyingTo({
                  id: menuMessage.id,
                  senderName: menuMessage.senderName,
                  text: menuMessage.text || "Ekli mesaj",
                })
              }
              onPin={() => void handleTogglePin(menuMessage.id)}
              onAssignTask={() => setTaskSource(menuMessage)}
            />
          )}
          {taskSource && (
            <ChatTaskSheet
              message={taskSource}
              contacts={allContacts}
              api={api}
              onClose={() => setTaskSource(null)}
              onCreated={(created) => {
                if (created?.id && created.channelId === selectedChannelRef.current?.id) {
                  setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
                }
                void loadTaskStats();
              }}
            />
          )}
          {tasksOpen && (
            <ChatTasksPanel
              api={api}
              onClose={() => { setTasksOpen(false); void loadTaskStats(); }}
            />
          )}

          {/* Body */}
          {!selectedChannel ? (
            /* Main Directory View */
            <div className="team-chat-directory">
              {activeTab === "settings" ? (
                /* WhatsApp Settings Screen */
                <div className="wa-settings-view">
                  <div className="wa-settings-profile-card" onClick={() => setInfoOpen("self")}>
                    <div
                      className="team-chat-avatar lg"
                      style={{ background: getAvatarGradient(currentUser.name), width: 56, height: 56, fontSize: 20 }}
                    >
                      <span>{getInitials(currentUser.name)}</span>
                    </div>
                    <div className="wa-settings-profile-info">
                      <strong>{currentUser.name}</strong>
                      <span className="wa-role-badge">{getRoleBadge(currentUser.role).label}</span>
                      <small>Profilinizi ve fotoğrafınızı düzenleyin ➔</small>
                    </div>
                  </div>

                  <div className="wa-settings-section">
                    <h4>BİLDİRİMLER & SESLER</h4>
                    <div className="wa-settings-row">
                      <div className="wa-settings-label">
                        <Volume2 size={18} className="wa-settings-icon" />
                        <div>
                          <strong>Bildirim Sesi</strong>
                          <small>Yeni mesaj geldiğinde ses çal</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`wa-toggle-switch ${soundEnabled ? "on" : "off"}`}
                        onClick={toggleSound}
                        aria-label="Ses Değiştir"
                      >
                        <span className="wa-toggle-knob" />
                      </button>
                    </div>

                    {onEnablePush && (
                      <div className="wa-settings-row">
                        <div className="wa-settings-label">
                          <Bell size={18} className="wa-settings-icon" />
                          <div>
                            <strong>Masaüstü Bildirimleri (Push)</strong>
                            <small>{pushEnabled ? "Bildirimler açık" : "Tarayıcı bildirimlerini açın"}</small>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`wa-toggle-switch ${pushEnabled ? "on" : "off"}`}
                          onClick={onEnablePush}
                          aria-label="Push Bildirimi"
                        >
                          <span className="wa-toggle-knob" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="wa-settings-section">
                    <h4>UYGULAMA HAKKINDA</h4>
                    <div className="wa-settings-row">
                      <div className="wa-settings-label">
                        <Sparkles size={18} className="wa-settings-icon" />
                        <div>
                          <strong>AriX Ekip Ağı</strong>
                          <small>Sürüm v2.4 · ERP Canlı Entegre</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="team-chat-list">
                {filteredChannels.length === 0 ? (
                  <div className="team-chat-empty">
                    <span className="team-chat-empty-icon">{activeTab === "dms" ? "💬" : "👥"}</span>
                    <strong>{activeTab === "dms" ? "Henüz sohbet yok" : "Grup bulunamadı"}</strong>
                    <small>
                      {activeTab === "dms"
                        ? "Bir ekip üyesiyle konuşmak için 'Yeni Sohbet' butonuna tıklayın."
                        : "Yeni bir grup oluşturarak ekip konuşmaları başlatabilirsiniz."}
                    </small>
                    {activeTab === "dms" && (
                      <button
                        type="button"
                        className="team-chat-empty-action-btn"
                        onClick={() => setNewChatModalOpen(true)}
                      >
                        <Plus size={14} /> Kişi Rehberini Aç ({allContacts.length})
                      </button>
                    )}
                  </div>
                ) : (
                  filteredChannels.map((c) => {
                    const isDm = c.type === "dm";
                    const roleInfo = getRoleBadge(c.role);

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`team-chat-item ${(c.unreadCount || 0) > 0 ? "has-unread" : ""}`}
                        onClick={() => openChannel(c)}
                      >
                        {isDm ? (
                          <div
                            className="team-chat-avatar"
                            style={{ background: getAvatarGradient(c.name) }}
                          >
                            {c.avatar?<img src={c.avatar} alt=""/>:<span>{c.id.startsWith("assistant:")?"🤖":getInitials(c.name)}</span>}
                            {c.isOnline && <span className="team-chat-status-dot online" />}
                          </div>
                        ) : (
                          <div className="team-chat-group-icon">
                            <span>{c.icon || "💬"}</span>
                          </div>
                        )}

                        <div className="team-chat-item-content">
                          <div className="team-chat-item-row">
                            <div className="team-chat-item-title-block">
                              <strong>{c.name}</strong>
                              {isDm && (
                                <span className={`team-chat-role-chip xs ${roleInfo.colorClass}`}>
                                  {roleInfo.label}
                                </span>
                              )}
                            </div>
                            {c.lastMessage && (
                              <time>{formatTime(c.lastMessage.createdAt)}</time>
                            )}
                          </div>

                          <div className="team-chat-item-row">
                            <p className="team-chat-item-preview">
                              {c.lastMessage ? (
                                <>
                                  <b>{c.lastMessage.senderName}: </b>
                                  {c.lastMessage.text}
                                </>
                              ) : (
                                <span className="team-chat-item-empty-desc">
                                  {c.description || (isDm ? (c.isOnline ? <span className="wa-list-online">● Çevrimiçi</span> : getDisplayPresence(c)) : "Konuşma başlatın")}
                                </span>
                              )}
                            </p>
                            {(c.unreadCount || 0) > 0 && (
                              <span className="team-chat-unread-badge">{c.unreadCount}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              )}

              {/* WhatsApp Bottom Tab Bar */}
              <nav className="wa-bottom-tab-bar" aria-label="Sekmeler">
                <button
                  type="button"
                  className={`wa-tab-item ${activeTab === "dms" ? "active" : ""}`}
                  onClick={() => { setActiveTab("dms"); setListFilter("all"); }}
                >
                  <MessageSquare size={22} />
                  <span>Sohbetler</span>
                  {totalUnread > 0 && <span className="wa-tab-badge">{totalUnread}</span>}
                </button>

                <button
                  type="button"
                  className={`wa-tab-item ${activeTab === "groups" ? "active" : ""}`}
                  onClick={() => { setActiveTab("groups"); setListFilter("all"); }}
                >
                  <Users size={22} />
                  <span>Gruplar</span>
                </button>

                <button
                  type="button"
                  className="wa-tab-item"
                  onClick={() => {
                    const orderChannel = channels.find((c) => c.id === "orders-export") || channels[0];
                    if (orderChannel) setSelectedChannel(orderChannel);
                  }}
                >
                  <Box size={22} />
                  <span>Siparişler</span>
                </button>

                <button
                  type="button"
                  className={`wa-tab-item ${activeTab === "settings" ? "active" : ""}`}
                  onClick={() => setActiveTab("settings")}
                >
                  <Settings size={22} />
                  <span>Ayarlar</span>
                </button>
              </nav>
            </div>
          ) : channelView === "mediaVault" ? (
            /* ================= MEDIA & DOCUMENTS VAULT ================= */
            <div className="team-chat-vault">
              <div className="team-chat-vault-nav">
                <button
                  type="button"
                  className={`team-chat-vault-tab ${vaultTab === "all" ? "is-active" : ""}`}
                  onClick={() => setVaultTab("all")}
                >
                  Tümü ({vaultPhotos.length + vaultAudio.length + vaultOrders.length})
                </button>
                <button
                  type="button"
                  className={`team-chat-vault-tab ${vaultTab === "photos" ? "is-active" : ""}`}
                  onClick={() => setVaultTab("photos")}
                >
                  📷 Fotoğraf ({vaultPhotos.length})
                </button>
                <button
                  type="button"
                  className={`team-chat-vault-tab ${vaultTab === "audio" ? "is-active" : ""}`}
                  onClick={() => setVaultTab("audio")}
                >
                  🎤 Sesli Not ({vaultAudio.length})
                </button>
                <button
                  type="button"
                  className={`team-chat-vault-tab ${vaultTab === "orders" ? "is-active" : ""}`}
                  onClick={() => setVaultTab("orders")}
                >
                  📦 Sipariş ({vaultOrders.length})
                </button>
              </div>

              <div className="team-chat-vault-content">
                {/* Photos Grid */}
                {(vaultTab === "all" || vaultTab === "photos") && vaultPhotos.length > 0 && (
                  <div className="team-chat-vault-section">
                    <h4>📷 Fotoğraflar & Belgeler</h4>
                    <div className="team-chat-vault-photos-grid">
                      {vaultPhotos.map((m) => (
                        <div
                          key={m.id}
                          className="team-chat-vault-photo-card"
                          onClick={() => setPreviewImageUrl(m.imageUrl!)}
                        >
                          <img src={m.imageUrl!} alt="Görsel" loading="lazy" />
                          <div className="team-chat-vault-photo-meta">
                            <span>{m.senderName}</span>
                            <time>{m.editedAt?'Düzenlendi · ':''}{formatTime(m.createdAt)}</time>
                            {!m.deletedAt&&<button className="team-chat-msg-menu" aria-label="Mesaj seçenekleri" onClick={(e)=>{e.stopPropagation();setMenuMessage(m);}}>⋯</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audio Notes */}
                {(vaultTab === "all" || vaultTab === "audio") && vaultAudio.length > 0 && (
                  <div className="team-chat-vault-section">
                    <h4>🎤 Sesli Mesajlar</h4>
                    <div className="team-chat-vault-audio-list">
                      {vaultAudio.map((m) => (
                        <div key={m.id} className="team-chat-vault-audio-item">
                          <div className="team-chat-vault-audio-header">
                            <strong>{m.senderName}</strong>
                            <time>{m.editedAt?'Düzenlendi · ':''}{formatTime(m.createdAt)}</time>
                            {!m.deletedAt&&<button className="team-chat-msg-menu" aria-label="Mesaj seçenekleri" onClick={(e)=>{e.stopPropagation();setMenuMessage(m);}}>⋯</button>}
                          </div>
                          <AudioBubblePlayer audioUrl={m.audioUrl!} duration={m.audioDuration} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Orders & Pallets */}
                {(vaultTab === "all" || vaultTab === "orders") && vaultOrders.length > 0 && (
                  <div className="team-chat-vault-section">
                    <h4>📦 Siparişler & Paletler</h4>
                    <div className="team-chat-vault-orders-list">
                      {vaultOrders.map((m) => (
                        <div key={m.id} className="team-chat-vault-order-item">
                          <div className="team-chat-vault-order-top">
                            <span className="team-chat-order-badge">📦 #{m.orderReference?.number}</span>
                            {m.orderReference?.customerName && (
                              <span className="team-chat-order-customer">{m.orderReference.customerName}</span>
                            )}
                            <button
                              type="button"
                              className="team-chat-inline-action-btn secondary"
                              onClick={() => onOpenOrder && onOpenOrder(m.orderReference!.number)}
                            >
                              <ExternalLink size={12} /> Siparişi Aç
                            </button>
                          </div>
                          {m.orderReference?.palletNumber && (
                            <div className="team-chat-pallet-spec">
                              <span className="team-chat-pallet-pill">🏷️ {m.orderReference.palletNumber}</span>
                              {m.orderReference.rollCount && <span>{m.orderReference.rollCount} rulo</span>}
                              {m.orderReference.netWeight && <span>Net: {m.orderReference.netWeight} kg</span>}
                              {m.orderReference.grossWeight && <span>Brüt: {m.orderReference.grossWeight} kg</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {vaultPhotos.length === 0 && vaultAudio.length === 0 && vaultOrders.length === 0 && (
                  <div className="team-chat-empty-compact">
                    <span>Bu sohbette henüz medya, sesli mesaj veya sipariş paylaşılmadı.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= ACTIVE CHAT MESSAGES VIEW ================= */
            <div className="team-chat-conversation">
              {/* Sticky Pinned Message Header Banner */}
              {pinnedMessage && (
                <div
                  className="team-chat-pinned-banner"
                  onClick={() => {
                    scrollToMessage(pinnedMessage.id);
                  }}
                >
                  <Pin size={13} className="team-chat-pinned-icon" />
                  <div className="team-chat-pinned-content">
                    <span className="team-chat-pinned-author">{pinnedMessage.senderName}:</span>
                    <span className="team-chat-pinned-text">
                      {pinnedMessage.text || (pinnedMessage.audioUrl ? "🎤 Sesli Mesaj" : "📷 Fotoğraf")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="team-chat-pinned-unpin"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePin(pinnedMessage.id);
                    }}
                    title="Sabitlemeyi kaldır"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {showInChatSearch && (
                <div className="ios-in-chat-search">
                  <Search size={14} />
                  <input
                    type="search"
                    autoFocus
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    placeholder="Bu sohbette ara..."
                  />
                  {messageSearch && (
                    <button type="button" onClick={() => setMessageSearch("")}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
              {/* Messages Stream */}
              <div className="team-chat-messages" ref={streamRef} onScroll={event=>{
                const el=event.currentTarget;
                nearBottomRef.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;
                if(!nearBottomRef.current || !selectedChannel || !messages.length || messageSearch)return;
                const last=messages[messages.length-1];
                if(!last || readThroughRef.current[selectedChannel.id]===last.id)return;
                readThroughRef.current[selectedChannel.id]=last.id;
                void api('/api/orders/chat/read',{method:'POST',body:JSON.stringify({channelId:selectedChannel.id,messageId:last.id})}).catch(()=>{});
              }}>
                {hasMore && <button type="button" disabled={loadingOlder} onClick={async()=>{if(!selectedChannel || !messages.length)return;nearBottomRef.current=false;setLoadingOlder(true);await loadMessages(selectedChannel.id,messages[0].id);setLoadingOlder(false);}}>Daha eski mesajları yükle</button>}
                {messages.length > renderedMessages.length && (
                  <button
                    type="button"
                    className="team-chat-load-older"
                    onClick={() => {
                      const next = Math.min(messages.length, renderLimitRef.current + 200);
                      renderLimitRef.current = next;
                      setRenderLimit(next);
                    }}
                  >
                    {messages.length - renderedMessages.length} eski mesajı göster
                  </button>
                )}
                {messages.length === 0 ? (
                  <div className="team-chat-conversation-empty">
                    <span className="team-chat-conv-icon">👋</span>
                    <strong>Sohbeti Başlatın</strong>
                    <small>Ekip üyeleriyle güvenli şirket içi yazışma</small>
                    <small>Fiyat sormak için /fiyat KOD yazın (örn. /fiyat 00233)</small>
                  </div>
                ) : (
                  renderedMessages.map((m, messageIndex) => {
                    const isMine = String(m.senderId) === String(currentUser.id);
                    return (
                      <div
                        id={`msg-${m.id}`}
                        key={m.id}
                        className={`team-chat-msg-row ${isMine ? "is-mine" : "is-other"} ${m.isPinned ? "is-pinned" : ""}`}
                      >
                        {(messageIndex===0 || new Date(renderedMessages[messageIndex-1].createdAt).toDateString()!==new Date(m.createdAt).toDateString())&&<div className="arix-chat-date">{new Date(m.createdAt).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})}</div>}
                        {!isMine && (
                          <div
                            className="team-chat-msg-avatar"
                            style={{ background: getAvatarGradient(m.senderName) }}
                          >
                            {m.senderId === "system" ? "🤖" : getInitials(m.senderName)}
                          </div>
                        )}

                        {/* For outgoing messages (mine), hover action bar appears on the left of bubble */}
                        {isMine && (
                          <div className="team-chat-msg-actions-hover is-mine">
                            <button
                              type="button"
                              onClick={() => setReplyingTo({ id: m.id, senderName: m.senderName, text: m.text || (m.audioUrl ? "Sesli Not" : "Fotoğraf") })}
                              title="Yanıtla"
                            >
                              <CornerUpLeft size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePin(m.id)}
                              title={m.isPinned ? "Sabitlemeyi Kaldır" : "Mesajı Sabitle"}
                            >
                              {m.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                            </button>
                          </div>
                        )}

                        <div className="team-chat-msg-bubble">
                          {!isMine && (
                            <div className="team-chat-msg-author">
                              <strong>{m.senderName}</strong>
                              {m.senderRole && (
                                <span className={`team-chat-role-chip xs ${getRoleBadge(m.senderRole).colorClass}`}>
                                  {getRoleBadge(m.senderRole).label}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Quoted Message Preview (Alıntı Yanıt) */}
                          {m.replyToReference && (
                            <div
                              className="team-chat-quoted-box"
                              onClick={() => {
                                scrollToMessage(m.replyToReference!.id);
                              }}
                            >
                              <strong>{m.replyToReference.senderName}</strong>
                              <p>{m.replyToReference.text}</p>
                            </div>
                          )}

                          {/* Product Reference Card */}
                          {m.productReference?.name && (
                            <div className="team-chat-product-card">
                              <div className="team-chat-product-head">
                                <Tag size={13} className="team-chat-product-icon" />
                                <strong>{m.productReference.name}</strong>
                              </div>
                              <div className="team-chat-product-meta">
                                {m.productReference.code && (
                                  <span className="team-chat-product-code">Kod: {m.productReference.code}</span>
                                )}
                                {m.productReference.stock !== undefined && (
                                  <span className="team-chat-product-stock">
                                    Stok: {m.productReference.stock} {m.productReference.unit || "m"}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Order & Pallet Reference Card with Inline ERP Actions */}
                          {m.orderReference?.number && (
                            <div className="team-chat-order-card">
                              <div className="team-chat-order-head">
                                <div className="team-chat-order-number-title">
                                  <Box size={14} className="team-chat-order-box-icon" />
                                  <strong>Sipariş #{m.orderReference.number}</strong>
                                </div>
                                {m.orderReference.status && (
                                  <span className="team-chat-order-status-badge">
                                    {m.orderReference.status}
                                  </span>
                                )}
                              </div>

                              {m.orderReference.customerName && (
                                <div className="team-chat-order-customer-line">
                                  <span>Müşteri:</span> <strong>{m.orderReference.customerName}</strong>
                                </div>
                              )}

                              {/* Pallet / Roll Drilldown Specs */}
                              {m.orderReference.palletNumber && (
                                <div className="team-chat-pallet-spec">
                                  <span className="team-chat-pallet-pill">🏷️ {m.orderReference.palletNumber}</span>
                                  {m.orderReference.rollCount && (
                                    <span className="team-chat-pallet-meta-item"><b>{m.orderReference.rollCount}</b> rulo</span>
                                  )}
                                  {m.orderReference.netWeight && (
                                    <span className="team-chat-pallet-meta-item">Net: <b>{m.orderReference.netWeight}</b> kg</span>
                                  )}
                                  {m.orderReference.grossWeight && (
                                    <span className="team-chat-pallet-meta-item">Brüt: <b>{m.orderReference.grossWeight}</b> kg</span>
                                  )}
                                  {m.orderReference.palletDimensions && (
                                    <span className="team-chat-pallet-meta-item">{m.orderReference.palletDimensions}</span>
                                  )}
                                </div>
                              )}

                              {/* Inline ERP Action Buttons */}
                              <div className="team-chat-inline-actions">
                                <button
                                  type="button"
                                  className="team-chat-inline-action-btn primary"
                                  onClick={() => onOpenOrder && onOpenOrder(m.orderReference!.number)}
                                  title="Sipariş detay penceresini aç"
                                >
                                  <ExternalLink size={12} /> Detayı Aç
                                </button>

                                {m.orderReference.id && isManagerOrSales && (
                                  <button
                                    type="button"
                                    className="team-chat-inline-action-btn approve"
                                    disabled={actionLoadingId === `${m.orderReference.id}-approve`}
                                    onClick={() => handleInlineOrderAction(m.orderReference!.id!, m.orderReference!.number, "approve")}
                                    title="Proforma onayını doğrudan sohbetten ver"
                                  >
                                    <CheckCircle2 size={12} /> Proforma Onayla
                                  </button>
                                )}

                                {m.orderReference.id && isWarehouseOrManager && (
                                  <button
                                    type="button"
                                    className="team-chat-inline-action-btn warehouse"
                                    disabled={actionLoadingId === `${m.orderReference.id}-prepared`}
                                    onClick={() => handleInlineOrderAction(m.orderReference!.id!, m.orderReference!.number, "prepared")}
                                    title="Siparişi paletlendi / hazırlandı olarak işaretle"
                                  >
                                    <PackageCheck size={12} /> Hazırlandı
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Attached Image Thumbnail */}
                          {m.imageUrl && (
                            <div
                              className="team-chat-msg-image-wrap"
                              onClick={() => setPreviewImageUrl(m.imageUrl!)}
                            >
                              <img src={m.imageUrl} alt="Fotoğraf" className="team-chat-msg-img" loading="lazy" />
                              <div className="team-chat-msg-img-overlay">
                                <Maximize2 size={14} />
                              </div>
                            </div>
                          )}

                          {/* Voice Message Audio Player */}
                          {m.audioUrl && (
                            <AudioBubblePlayer audioUrl={m.audioUrl} duration={m.audioDuration} />
                          )}

                          {m.forwarded&&<small>↪ İletildi</small>}
                          {m.fileReference&&<a href={m.fileReference.url} download className="arix-chat-file"><FileText size={24}/><span><b>{m.fileReference.name}</b><small>{(m.fileReference.size/1024).toFixed(0)} KB · İndir</small></span></a>}
                          {/* Text Message */}
                          {m.text && <div className="team-chat-msg-text">{m.text}</div>}
                          {m.taskReference && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                              <ClipboardList size={13} />
                              <span>
                                Görev: {m.taskReference.title}
                                {m.taskReference.assigneeName ? ` · ${m.taskReference.assigneeName}` : ""}
                                {m.taskReference.dueAt ? ` · son ${new Date(m.taskReference.dueAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                              </span>
                            </div>
                          )}

                          {!!Object.keys(m.reactions||{}).length&&<div className="team-chat-msg-reactions">{[...new Set(Object.values(m.reactions||{}))].map(emoji=><span key={emoji}>{emoji} {Object.values(m.reactions||{}).filter(r=>r===emoji).length}</span>)}</div>}
                          <div className="team-chat-msg-footer">
                            <time>{m.editedAt?'Düzenlendi · ':''}{formatTime(m.createdAt)}</time>
                            {!m.deletedAt&&<button className="team-chat-msg-menu" aria-label="Mesaj seçenekleri" onClick={(e)=>{e.stopPropagation();setMenuMessage(m);}}>⋯</button>}
                            {/* Read Receipts */}
                            {isMine && (
                              m.readStatus === "read" ? (
                                <span title="Okundu" className="team-chat-receipt read"><CheckCheck size={13} /></span>
                              ) : m.readStatus === "delivered" ? (
                                <span title="İletildi" className="team-chat-receipt delivered"><CheckCheck size={13} /></span>
                              ) : (
                                <span title="Gönderildi" className="team-chat-receipt sent"><Check size={13} /></span>
                              )
                            )}
                          </div>
                        </div>

                        {/* For incoming messages (other), hover action bar appears on the right of bubble */}
                        {!isMine && (
                          <div className="team-chat-msg-actions-hover is-other">
                            <button
                              type="button"
                              onClick={() => setReplyingTo({ id: m.id, senderName: m.senderName, text: m.text || (m.audioUrl ? "Sesli Not" : "Fotoğraf") })}
                              title="Yanıtla"
                            >
                              <CornerUpLeft size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePin(m.id)}
                              title={m.isPinned ? "Sabitlemeyi Kaldır" : "Mesajı Sabitle"}
                            >
                              {m.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {/* WhatsApp Outgoing Failed / Queued Messages with Retry Icon */}
                {outbox.filter((entry) => entry.payload.channelId === selectedChannel?.id).map((entry) => (
                  <div key={entry.id} className="team-chat-msg-row is-mine is-queued">
                    <button
                      type="button"
                      className="wa-msg-retry-btn"
                      onClick={() => void sendQueuedMessage(entry)}
                      title="Tekrar Gönder"
                      aria-label="Tekrar Gönder"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <div className="team-chat-msg-bubble is-failed">
                      {entry.payload.text && <p className="team-chat-msg-text">{entry.payload.text}</p>}
                      {(entry.payload.audioUrl || entry.voiceData) && (
                        <div className="team-chat-voice-player">
                          <button type="button" className="team-chat-voice-play-btn" disabled>
                            <Play size={14} />
                          </button>
                          <div className="team-chat-voice-wave"><div className="team-chat-voice-bar" /></div>
                          <span className="team-chat-voice-duration">
                            {entry.payload.audioDuration ? `${entry.payload.audioDuration}s` : "Ses"}
                          </span>
                        </div>
                      )}
                      {entry.payload.orderReference && (
                        <div className="team-chat-order-card">
                          <div className="team-chat-order-card-header">
                            <Box size={14} />
                            <strong>Sipariş #{entry.payload.orderReference.number}</strong>
                          </div>
                        </div>
                      )}
                      <div className="team-chat-msg-footer">
                        <span className="wa-msg-failed-status">
                          <AlertCircle size={12} /> Gönderilemedi · Tekrar dene
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {typingNames.length>0&&<small style={{padding:"4px 16px"}}>{typingNames.join(", ")} yazıyor…</small>}
              {/* Quoted Message (Reply Preview Banner) */}
              {replyingTo && (
                <div className="team-chat-reply-banner">
                  <div className="team-chat-reply-content">
                    <span className="team-chat-reply-title">
                      <CornerUpLeft size={12} /> {replyingTo.senderName} kişisine yanıt:
                    </span>
                    <span className="team-chat-reply-snippet">{replyingTo.text}</span>
                  </div>
                  <button
                    type="button"
                    className="team-chat-reply-close"
                    onClick={() => setReplyingTo(null)}
                    aria-label="Yanıtı iptal et"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Attachments Preview Bar */}
              {(attachOrder || attachProduct || attachImage || isUploadingImage) && (
                <div className="team-chat-composer-attachments">
                  {attachOrder && (
                    <div className="team-chat-attached-chip order">
                      <span>
                        📦 <b>#{attachOrder.number}</b>
                        {attachOrder.palletNumber ? ` · ${attachOrder.palletNumber}` : ""}
                        {attachOrder.rollCount ? ` (${attachOrder.rollCount} rulo)` : ""}
                      </span>
                      <button type="button" onClick={() => {
                        setAttachOrder(null);
                        const curKey = attachOrder ? `${attachOrder.id || ""}_${attachOrder.number}_${attachOrder.palletNumber || ""}_${attachOrder.rollCount || ""}` : "";
                        if (curKey) lastPresetOrderKeyRef.current = "dismissed:" + curKey;
                        if (selectedChannel) {
                          try {
                            const k = `arix-chat-draft:${currentUser.id}:${selectedChannel.id}`;
                            const draft = JSON.parse(localStorage.getItem(k) || "{}");
                            delete draft.order;
                            localStorage.setItem(k, JSON.stringify(draft));
                          } catch {}
                        }
                        if (onClearPreset) onClearPreset();
                      }} aria-label="Kaldır"><X size={12} /></button>
                    </div>
                  )}

                  {attachProduct && (
                    <div className="team-chat-attached-chip product">
                      <span>🏷️ <b>{attachProduct.name}</b> {attachProduct.code ? `(${attachProduct.code})` : ""}</span>
                      <button type="button" onClick={() => { setAttachProduct(null); lastPresetProductKeyRef.current = null; if (onClearPreset) onClearPreset(); }} aria-label="Kaldır"><X size={12} /></button>
                    </div>
                  )}

                  {attachImage && (
                    <div className="team-chat-attached-chip image">
                      <img src={attachImage} alt="Fotoğraf" className="team-chat-attached-thumb" />
                      <span>Fotoğraf</span>
                      <button type="button" onClick={() => setAttachImage(null)} aria-label="Kaldır"><X size={12} /></button>
                    </div>
                  )}

                  {isUploadingImage && (
                    <div className="team-chat-attached-chip loading">
                      <span>Fotoğraf yükleniyor...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Attachment Toolbar (Opens cleanly above composer when + is clicked) */}
              {attachMenuOpen && (
                <div className="team-chat-attach-toolbar">
                  <div className="team-chat-attach-toolbar-items">
                    <button
                      type="button"
                      className="team-chat-attach-pill photo"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      title="Fotoğraf veya Belge Yükle"
                    >
                      <Camera size={14} /> <span>Fotoğraf</span>
                    </button>
                    <button
                      type="button"
                      className="team-chat-attach-pill order"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        setOrderSearch("");
                        setDrillOrder(null);
                        setOrderPickerOpen(true);
                      }}
                      title="Sipariş veya Palet Seç"
                    >
                      <Box size={14} /> <span>Sipariş & Palet</span>
                    </button>
                    <button
                      type="button"
                      className="team-chat-attach-pill product"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        setProductSearch("");
                        setProductPickerOpen(true);
                      }}
                      title="Stoktaki Ürünü Seç"
                    >
                      <Tag size={14} /> <span>Stok Ürünü</span>
                    </button>
                    <button
                      type="button"
                      className="team-chat-attach-pill"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        setText("/fiyat ");
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      title="Fiyat sor: /fiyat KOD"
                    >
                      <Search size={14} /> <span>Fiyat sor</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="team-chat-attach-close-btn"
                    onClick={() => setAttachMenuOpen(false)}
                    aria-label="Kapat"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Message Composer & Walkie-Talkie Voice Recorder */}
              {isRecordingVoice ? (
                <div className="team-chat-recording-bar">
                  <div className="team-chat-recording-pulse-dot" />
                  <div className="team-chat-recording-timer">
                    00:{recordingSeconds < 10 ? "0" : ""}{recordingSeconds}
                  </div>
                  <div className="team-chat-recording-wave">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="team-chat-recording-actions">
                    <button
                      type="button"
                      className="team-chat-record-cancel-btn"
                      onClick={cancelVoiceRecording}
                      title="Kaydı İptal Et"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      type="button"
                      className="team-chat-record-send-btn"
                      onClick={stopAndSendVoiceRecording}
                      title="Sesli Mesajı Gönder"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <form className="team-chat-composer" onSubmit={handleSendMessage}>
                  {/* Hidden file input for camera/gallery */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageSelect}
                  />

                  {/* Attachment + Toggle Button */}
                  <button
                    type="button"
                    className={`team-chat-attach-toggle-btn ${attachMenuOpen ? "is-open" : (attachOrder || attachProduct || attachImage ? "has-item" : "")}`}
                    onClick={() => setAttachMenuOpen((prev) => !prev)}
                    title={attachMenuOpen ? "Menüyü Kapat" : "Fotoğraf, Sipariş veya Ürün Ekle"}
                    aria-label="Eklenti Ekle"
                  >
                    <Plus size={18} />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="text"
                    placeholder="Mesajınızı yazın (veya resim yapıştırın)..."
                    value={text}
                    onChange={(e) => {setText(e.target.value);if(selectedChannel && Date.now()-typingAt.current>2500){typingAt.current=Date.now();void api("/api/orders/chat/typing",{method:"POST",body:JSON.stringify({channelId:selectedChannel.id})}).catch(()=>{});}if(selectedChannel)try{localStorage.setItem(`arix-chat-draft:${currentUser.id}:${selectedChannel.id}`,JSON.stringify({text:e.target.value,image:attachImage,order:attachOrder,product:attachProduct,reply:replyingTo}));}catch{}}}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    onPaste={handlePaste}
                    maxLength={2000}
                  />

                  {/* Smart Action: Send button if text/attachments exist; Mic button if empty */}
                  {text.trim() || attachImage || attachOrder || attachProduct ? (
                    <button
                      type="submit"
                      className="team-chat-action-btn-primary"
                      disabled={isUploadingImage}
                      onMouseDown={(e) => e.preventDefault()}
                      aria-label="Gönder"
                      title="Gönder"
                    >
                      <Send size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="team-chat-action-btn-mic"
                      onClick={startVoiceRecording}
                      title="Sesli Mesaj Kaydet (Telsiz)"
                      aria-label="Sesli Mesaj"
                    >
                      <Mic size={18} />
                    </button>
                  )}
                </form>
              )}
            </div>
          )}

          {/* ================= MODALS ================= */}

          {/* 1. WHATSAPP STYLE CONTACTS MODAL (YENİ SOHBET BAŞLAT) */}
          {newChatModalOpen && (
            <div className="team-chat-modal-overlay">
              <div className="team-chat-directory-modal">
                <header>
                  <div className="team-chat-modal-head-text">
                    <strong>Yeni Sohbet Başlat</strong>
                    <small>Şirket içi tüm ekip üyeleri ({allContacts.length})</small>
                  </div>
                  <button type="button" onClick={() => setNewChatModalOpen(false)}>
                    <X size={17} />
                  </button>
                </header>

                <div className="team-chat-modal-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="İsim veya departman ara..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    autoFocus
                  />
                  {contactSearch && (
                    <button type="button" onClick={() => setContactSearch("")}>
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="team-chat-modal-contact-list">
                  {filteredAllContacts.length === 0 ? (
                    <div className="team-chat-empty-compact">
                      <span>Kişi bulunamadı.</span>
                    </div>
                  ) : (
                    filteredAllContacts.map((contact) => {
                      const roleInfo = getRoleBadge(contact.role);
                      return (
                        <button
                          key={contact.id}
                          type="button"
                          className="team-chat-contact-row"
                          onClick={() => startDmWithContact(contact)}
                        >
                          <div
                            className="team-chat-avatar"
                            style={{ background: getAvatarGradient(contact.name) }}
                          >
                            {contact.avatar?<img src={contact.avatar} alt=""/>:<span>{contact.id.startsWith("assistant:")?"🤖":getInitials(contact.name)}</span>}
                            {contact.isOnline && <span className="team-chat-status-dot online" />}
                          </div>

                          <div className="team-chat-contact-info">
                            <div className="team-chat-contact-name-row">
                              <strong>{contact.name}</strong>
                              <span className={`team-chat-role-chip xs ${roleInfo.colorClass}`}>
                                {roleInfo.label}
                              </span>
                            </div>
                            <small className={`team-chat-contact-presence ${contact.isOnline ? "is-online" : ""}`}>
                              {contact.isOnline ? "● Çevrimiçi" : (contact.lastSeenText || "Çevrimdışı")}
                            </small>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. ORDER & PALLET PICKER MODAL (PALET VE RULO DERİN BAĞLAMA) */}
          {orderPickerOpen && (
            <div className="team-chat-modal-overlay">
              <div className="team-chat-directory-modal">
                <header>
                  <div className="team-chat-modal-head-text">
                    <strong>{drillOrder ? `Sipariş #${drillOrder.number} Paletleri` : "Sipariş Seç & Palet Bağla"}</strong>
                    <small>{drillOrder ? "Spesifik bir palet seçin veya özel palet girin" : "Ekiple konuşmak istediğiniz siparişi seçin"}</small>
                  </div>
                  <button type="button" onClick={() => { setOrderPickerOpen(false); setDrillOrder(null); }}>
                    <X size={17} />
                  </button>
                </header>

                {!drillOrder ? (
                  <>
                    <div className="team-chat-modal-search">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Sipariş no veya müşteri ara..."
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        autoFocus
                      />
                      {orderSearch && (
                        <button type="button" onClick={() => setOrderSearch("")}>
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="team-chat-modal-contact-list">
                      {filteredOrders.length === 0 ? (
                        <div className="team-chat-empty-compact">
                          <span>Sipariş bulunamadı.</span>
                        </div>
                      ) : (
                        filteredOrders.map((o) => (
                          <div key={o.id} className="team-chat-order-select-row">
                            <div
                              className="team-chat-picker-details clickable"
                              onClick={() => {
                                setAttachOrder({
                                  id: String(o.id),
                                  number: String(o.number),
                                  customerName: o.customerName,
                                  status: o.status,
                                });
                                setOrderPickerOpen(false);
                              }}
                            >
                              <strong>#{o.number} {o.customerName ? `· ${o.customerName}` : ""}</strong>
                              <small>Durum: {o.status || "Aktif"} · {o.items?.length || 0} kalem ürün</small>
                            </div>
                            <button
                              type="button"
                              className="team-chat-pallet-drill-btn"
                              onClick={() => setDrillOrder(o)}
                              title="Paletleri detaylı incele & seç"
                            >
                              <Layers size={13} /> Palet Seç <ChevronRight size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  /* Drilldown: Pallet Selection & Custom Pallet Definition */
                  <div className="team-chat-drilldown-container">
                    <div className="team-chat-drilldown-back">
                      <button type="button" onClick={() => setDrillOrder(null)}>
                        <ArrowLeft size={14} /> Sipariş Listesine Dön
                      </button>
                      <button
                        type="button"
                        className="team-chat-select-whole-order-btn"
                        onClick={() => {
                          setAttachOrder({
                            id: String(drillOrder.id),
                            number: String(drillOrder.number),
                            customerName: drillOrder.customerName,
                            status: drillOrder.status,
                          });
                          setDrillOrder(null);
                          setOrderPickerOpen(false);
                        }}
                      >
                        Tüm Siparişi Ekle (# {drillOrder.number})
                      </button>
                    </div>

                    <div className="team-chat-pallet-options-list">
                      <h5>📦 Mevcut Paletler & Dağılımlar</h5>
                      {drillOrder.approvalForm?.packages && drillOrder.approvalForm.packages.length > 0 ? (
                        drillOrder.approvalForm.packages.map((pkg: any, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            className="team-chat-pallet-option-btn"
                            onClick={() => {
                              setAttachOrder({
                                id: String(drillOrder.id),
                                number: String(drillOrder.number),
                                customerName: drillOrder.customerName,
                                palletNumber: `Palet ${pkg.packageNumber || idx + 1}`,
                                rollCount: pkg.rollCount || pkg.rolls,
                                palletDimensions: pkg.dimensions || `${pkg.width || 100}x${pkg.length || 120} cm`,
                                netWeight: pkg.netWeight,
                                grossWeight: pkg.grossWeight,
                                status: drillOrder.status,
                              });
                              setDrillOrder(null);
                              setOrderPickerOpen(false);
                            }}
                          >
                            <span className="team-chat-pallet-pill">Palet {pkg.packageNumber || idx + 1}</span>
                            <div className="team-chat-pallet-info-line">
                              {pkg.rollCount && <span>{pkg.rollCount} rulo</span>}
                              {pkg.netWeight && <span>Net: {pkg.netWeight} kg</span>}
                              {pkg.grossWeight && <span>Brüt: {pkg.grossWeight} kg</span>}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="team-chat-empty-compact">
                          <span>Otomatik paket listesi bulunamadı. Aşağıdan özel palet/rulo bilgisi tanımlayabilirsiniz.</span>
                        </div>
                      )}

                      {/* Custom Pallet Specifier */}
                      <div className="team-chat-custom-pallet-box">
                        <h6>➕ Özel Palet / Rulo Tanımla</h6>
                        <div className="team-chat-custom-grid">
                          <input
                            type="text"
                            placeholder="Palet No (Örn: Palet 1)"
                            value={customPalletNum}
                            onChange={(e) => setCustomPalletNum(e.target.value)}
                          />
                          <input
                            type="number"
                            placeholder="Rulo Sayısı (Örn: 14)"
                            value={customRollCount}
                            onChange={(e) => setCustomRollCount(e.target.value)}
                          />
                          <input
                            type="number"
                            placeholder="Net kg (Örn: 1078)"
                            value={customNetWeight}
                            onChange={(e) => setCustomNetWeight(e.target.value)}
                          />
                          <input
                            type="number"
                            placeholder="Brüt kg (Örn: 1120)"
                            value={customGrossWeight}
                            onChange={(e) => setCustomGrossWeight(e.target.value)}
                          />
                          <input
                            type="text"
                            placeholder="Ölçü (100x120x155 cm)"
                            value={customDimensions}
                            onChange={(e) => setCustomDimensions(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="team-chat-custom-pallet-submit"
                          disabled={!customPalletNum.trim()}
                          onClick={() => {
                            setAttachOrder({
                              id: String(drillOrder.id),
                              number: String(drillOrder.number),
                              customerName: drillOrder.customerName,
                              palletNumber: customPalletNum.trim(),
                              rollCount: customRollCount ? Number(customRollCount) : undefined,
                              palletDimensions: customDimensions.trim() || undefined,
                              netWeight: customNetWeight ? Number(customNetWeight) : undefined,
                              grossWeight: customGrossWeight ? Number(customGrossWeight) : undefined,
                              status: drillOrder.status,
                            });
                            setDrillOrder(null);
                            setOrderPickerOpen(false);
                            setCustomPalletNum("");
                            setCustomRollCount("");
                            setCustomNetWeight("");
                            setCustomGrossWeight("");
                            setCustomDimensions("");
                          }}
                        >
                          <Plus size={13} /> Bu Paleti Sohbete Bağla
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. PRODUCT PICKER MODAL */}
          {productPickerOpen && (
            <div className="team-chat-modal-overlay">
              <div className="team-chat-directory-modal">
                <header>
                  <div className="team-chat-modal-head-text">
                    <strong>Stoktaki Ürünü Seç</strong>
                    <small>Fiyat, stok ve özellikleri ekiple görüşün</small>
                  </div>
                  <button type="button" onClick={() => setProductPickerOpen(false)}>
                    <X size={17} />
                  </button>
                </header>

                <div className="team-chat-modal-search">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Ürün adı veya kod ara..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    autoFocus
                  />
                  {productSearch && (
                    <button type="button" onClick={() => setProductSearch("")}>
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="team-chat-modal-contact-list">
                  {filteredProducts.length === 0 ? (
                    <div className="team-chat-empty-compact">
                      <span>Ürün bulunamadı.</span>
                    </div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="team-chat-picker-row"
                        onClick={() => {
                          setAttachProduct({
                            id: String(p.id),
                            name: p.name,
                            code: p.code,
                            stock: p.quantity,
                            unit: p.unit || "m",
                          });
                          setProductPickerOpen(false);
                        }}
                      >
                        <div className="team-chat-picker-badge tag">
                          <Tag size={15} />
                        </div>
                        <div className="team-chat-picker-details">
                          <strong>{p.name} {p.code ? `(${p.code})` : ""}</strong>
                          <small>Stok: {p.quantity || 0} {p.unit || "m"}</small>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. NEW GROUP MODAL */}
          {newGroupOpen && (
            <div className="team-chat-modal-overlay">
              <div className="team-chat-modal">
                <header>
                  <strong>Yeni Ekip Grubu</strong>
                  <button type="button" onClick={() => setNewGroupOpen(false)}>
                    <X size={17} />
                  </button>
                </header>

                <form onSubmit={handleCreateGroup}>
                  <div className="team-chat-modal-body">
                    <label>
                      Grup İkonu:
                      <div className="team-chat-emoji-picker">
                        {["💬", "📦", "🏭", "💰", "🚚", "⚡", "📑", "🔥"].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={newGroupIcon === emoji ? "is-selected" : ""}
                            onClick={() => setNewGroupIcon(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </label>

                    <label>
                      Grup Adı:
                      <input
                        type="text"
                        placeholder="Örn: İhracat Operasyon"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        maxLength={50}
                        required
                        autoFocus
                      />
                    </label>

                    <label>
                      Açıklama (İsteğe bağlı):
                      <input
                        type="text"
                        placeholder="Örn: Yükleme ve gümrük koordinasyonu"
                        value={newGroupDesc}
                        onChange={(e) => setNewGroupDesc(e.target.value)}
                        maxLength={150}
                      />
                    </label>
                  </div>

                  <footer>
                    <button type="button" className="secondary" onClick={() => setNewGroupOpen(false)}>
                      İptal
                    </button>
                    <button type="submit" className="primary" disabled={!newGroupName.trim()}>
                      Grup Oluştur
                    </button>
                  </footer>
                </form>
              </div>
            </div>
          )}

          {/* 5. LIGHTBOX IMAGE PREVIEW MODAL */}
          {previewImageUrl && (
            <div className="team-chat-lightbox" onClick={() => setPreviewImageUrl(null)}>
              <div className="team-chat-lightbox-content" onClick={(e) => e.stopPropagation()}>
                <img src={previewImageUrl} alt="Büyük önizleme" className="team-chat-lightbox-img" />
                <div className="team-chat-lightbox-actions">
                  <a
                    href={previewImageUrl}
                    download="arix-foto.jpg"
                    target="_blank"
                    rel="noreferrer"
                    className="team-chat-lightbox-btn"
                  >
                    Fotoğrafı İndir
                  </a>
                  <button
                    type="button"
                    className="team-chat-lightbox-btn close"
                    onClick={() => setPreviewImageUrl(null)}
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
