/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Film, 
  Layers, 
  MessageSquare, 
  Clock, 
  Settings, 
  ChevronRight, 
  ChevronDown, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Search,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  Download,
  Upload,
  Settings2,
  History,
  Info,
  FolderSync,
  PieChart as PieChartIcon,
  Activity,
  Lightbulb,
  RefreshCw,
  Pencil,
  MousePointer2,
  Square,
  Eraser,
  Type as TypeIcon,
  Maximize2,
  ArrowLeft,
  Send,
  Bot,
  FileVideo,
  Calendar,
  MoreVertical,
  LogOut,
  LogIn,
  X,
  ChevronLeft,
  Sun,
  Repeat,
  FastForward,
  PlayCircle,
  Scissors,
  GripVertical,
  Image,
  Music,
  Volume2,
  FolderOpen,
  Clapperboard,
  ChevronUp,
  Link2,
  FilmIcon,
  AudioWaveform,
  ZoomIn,
  ZoomOut,
  Move,
  Eye,
  ContextMenu,
  FileText,
  GitCompare,
  Columns,
  Layers2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { db, type Project, type Shot, type Task, type Version, type Annotation, type Reference } from './db';
import { format } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';

// AI Service
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const DEFAULT_STAGES = [
  'Creative',
  'Storyboard',
  'Previs',
  'Asset',
  'Animation',
  'FX',
  'Lighting',
  'Comp'
];

const STAGE_LABELS: Record<string, string> = {
  'Creative': '创意',
  'Storyboard': '分镜',
  'Previs': '预演',
  'Asset': '资产',
  'Animation': '动画',
  'FX': '特效',
  'Lighting': '灯光',
  'Comp': '合成'
};

const STAGE_ICONS: Record<string, any> = {
  'Creative': Lightbulb,
  'Storyboard': Pencil,
  'Previs': FileVideo,
  'Asset': Layers,
  'Animation': Activity,
  'FX': Sparkles,
  'Lighting': Info,
  'Comp': Layers
};

  // --- Helpers ---

  // Extract Chinese pinyin initials for project abbreviation
  const getProjectAbbr = (projectName: string): string => {
    // Try to extract meaningful abbreviation
    // For Chinese names, take first char pinyin-like; for English, take uppercase initials
    const abbrMap: Record<string, string> = {
      '黑': 'H', '猫': 'M', '警': 'J', '长': 'Z',
      '大': 'D', '闹': 'N', '天': 'T', '宫': 'G',
      '哪': 'N', '吒': 'Z', '西': 'X', '游': 'Y',
      '记': 'J', '红': 'H', '海': 'H', '底': 'D',
      '世': 'S', '界': 'J', '花': 'H', '木': 'M',
      '兰': 'L', '花': 'H', '雪': 'X', '人': 'R',
      '宝': 'B', '莲': 'L', '灯': 'D', '白': 'B',
      '蛇': 'S', '传': 'C', '青': 'Q', '年': 'N',
      '熊': 'X', '出': 'C', '没': 'M', '喜': 'X',
      '羊': 'Y', '美': 'M', '人': 'R', '鱼': 'Y',
      '战': 'Z', '狼': 'L', '飞': 'F', '天': 'T',
    };
    
    // Take first 4 characters of project name
    const chars = projectName.replace(/\s/g, '').slice(0, 4);
    let abbr = '';
    for (const ch of chars) {
      if (/[A-Za-z]/.test(ch)) {
        abbr += ch.toUpperCase();
      } else if (abbrMap[ch]) {
        abbr += abbrMap[ch];
      } else if (/[\u4e00-\u9fff]/.test(ch)) {
        // For unknown Chinese chars, use a hash-based single letter
        abbr += String.fromCharCode(65 + (ch.charCodeAt(0) % 26));
      } else {
        abbr += ch;
      }
    }
    // Ensure at least 2 chars
    return abbr.slice(0, 4).padEnd(2, 'X').toUpperCase();
  };

  const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const getVideoMetadata = (videoUrl: string, file?: File): Promise<{ fps: number; duration: number; resolution: string; fileSize: number } | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const timeout = setTimeout(() => {
      video.remove();
      resolve(null);
    }, 5000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const metadata = {
        fps: 24, 
        duration: video.duration,
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        fileSize: file ? file.size : 0
      };
      video.remove();
      resolve(metadata);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      video.remove();
      resolve(null);
    };

    video.load();
  });
};

const generateThumbnail = (videoUrl: string, targetTime?: number): Promise<string | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      video.remove();
      resolve(null);
    }, 5000);

    video.onloadeddata = () => {
      try {
        const time = targetTime !== undefined ? targetTime : (isNaN(video.duration) || !isFinite(video.duration) ? 0 : Math.min(1, video.duration / 2));
        video.currentTime = time;
      } catch (e) {
        clearTimeout(timeout);
        resolve(null);
      }
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(null);
      }
      video.remove();
    };

    video.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
      video.remove();
    };

    video.load();
  });
};

/**
 * 从原始视频中提取指定时间段的视频片段
 * 使用 play() + requestAnimationFrame + MediaRecorder 实现纯浏览器端视频切分
 * 比 seek 循环方式更稳定，利用浏览器原生播放引擎逐帧渲染
 * 
 * @param sourceFile 原始视频 File 对象
 * @param startTime 起始时间（秒）
 * @param endTime 结束时间（秒）
 * @returns 切分后的视频 Blob
 */
const extractVideoSegment = (sourceFile: File, startTime: number, endTime: number): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(sourceFile);
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      try { video.pause(); video.remove(); } catch {}
      resolve(null);
    }, 60000);

    video.onloadedmetadata = () => {
      const actualEnd = Math.min(endTime, video.duration);
      const duration = actualEnd - startTime;
      if (duration <= 0.01) {
        clearTimeout(timeout);
        video.remove();
        resolve(null);
        return;
      }

      const vw = Math.min(video.videoWidth || 1280, 1920);
      const vh = Math.min(video.videoHeight || 720, 1080);

      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d')!;

      // 选择最佳编码格式
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : 'video/webm';

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        clearTimeout(timeout);
        video.remove();
        if (chunks.length === 0) { resolve(null); return; }
        resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => { clearTimeout(timeout); video.remove(); resolve(null); };

      // 开始录制
      recorder.start(200);

      // 定位到起始位置并播放
      video.currentTime = startTime;
      
      video.onseeked = () => {
        video.play().then(() => {
          // 用 rAF 循环将视频帧绘制到 canvas（MediaRecorder 自动捕获）
          const drawFrame = () => {
            if (video.paused || video.ended || video.currentTime >= actualEnd) {
              // 绘制最后一帧
              try { ctx.drawImage(video, 0, 0, vw, vh); } catch {}
              // 停止录制
              try { video.pause(); recorder.stop(); } catch {}
              return;
            }
            
            try {
              ctx.drawImage(video, 0, 0, vw, vh);
              requestAnimationFrame(drawFrame);
            } catch {
              try { video.pause(); recorder.stop(); } catch { resolve(null); }
            }
          };
          
          requestAnimationFrame(drawFrame);
        }).catch(() => {
          // play 失败时尝试静音播放
          video.muted = true;
          video.play().then(() => requestAnimationFrame(function drawFrame() {
            if (video.paused || video.ended || video.currentTime >= actualEnd) {
              try { ctx.drawImage(video, 0, 0, vw,vh); } catch {}
              try { video.pause(); recorder.stop(); } catch {} return;
            }
            try { ctx.drawImage(video,0,0,vw,vh); requestAnimationFrame(drawFrame); }
            catch { try{video.pause();recorder.stop();}catch{} resolve(null);}
          })).catch(() => { resolve(null); });
        });
      };
    };

    video.onerror = () => { clearTimeout(timeout); video.remove(); resolve(null); };
  });
};

/**
 * 生成音频波形图数据（归一化浮点数组）
 * 支持音频文件和视频文件（提取音频轨道）
 */
const generateWaveform = (sourceUrl: string, isVideo = false): Promise<Float32Array | null> => {
  return new Promise((resolve) => {
    const audioCtx = new AudioContext();
    let mediaEl: HTMLAudioElement | HTMLVideoElement;

    if (isVideo) {
      mediaEl = document.createElement('video');
      mediaEl.muted = true;
      mediaEl.playsInline = true;
    } else {
      mediaEl = document.createElement('audio');
    }
    mediaEl.src = sourceUrl;
    mediaEl.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => {
      mediaEl.remove();
      audioCtx.close();
      resolve(null);
      }, 15000);

    mediaEl.onloadeddata = async () => {
      try {
        const sourceNode = audioCtx.createMediaElementSource(mediaEl);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0.3;
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        // 播放到结束以收集全部波形数据
        mediaEl.currentTime = 0;
        await mediaEl.play();

        const allData: number[] = [];
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);

        const collect = () => {
          analyser.getFloatTimeDomainData(dataArray);
          // 取 RMS 作为该时刻的振幅
          let rms = 0;
          for (let i = 0; i < bufferLength; i++) rms += dataArray[i] * dataArray[i];
          rms = Math.sqrt(rms / bufferLength);
          allData.push(rms);

          if (mediaEl.currentTime < mediaEl.duration - 0.05) {
            requestAnimationFrame(collect);
          } else {
            clearTimeout(timeout);
            mediaEl.pause();
            mediaEl.remove();
            sourceNode.disconnect();
            analyser.disconnect();
            audioCtx.close();
            // 归一化到 0~1
            const maxVal = Math.max(...allData, 0.001);
            const result = new Float32Array(allData.map(v => v / maxVal));
            resolve(result);
          }
        };
        // 等一小段再开始采集
        setTimeout(collect, 100);
      } catch (e) {
        clearTimeout(timeout);
        mediaEl.remove();
        audioCtx.close();
        resolve(null);
      }
    };

    mediaEl.onerror = () => {
      clearTimeout(timeout);
      mediaEl.remove();
      audioCtx.close();
      resolve(null);
    };

    mediaEl.load();
  });
};

/**
 * 从视频文件中提取音频为 WAV Blob
 */
const extractAudioFromVideo = (file: File): Promise<{ blob: Blob; dataUrl: string } | null> => {
  return new Promise((resolve) => {
    // 使用 fetch + decodeAudioData 方式提取音频，兼容本地文件（blob URL）
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      try { URL.revokeObjectURL(objectUrl); } catch(_) {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 30000);

    fetch(objectUrl)
      .then(response => response.arrayBuffer())
      .then(async (arrayBuffer) => {
        try {
          // 用 AudioContext 解码音频轨道（兼容 mp4/webm 等容器的音频流）
          const audioCtx = new OfflineAudioContext(2, 44100 * 60, 44100);
          const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

          // 用实际时长重新创建正确长度的 buffer
          const actualCtx = new OfflineAudioContext(
            decoded.numberOfChannels,
            Math.ceil(decoded.duration * decoded.sampleRate),
            decoded.sampleRate
          );

          const newBuffer = actualCtx.createBuffer(
            decoded.numberOfChannels,
            actualCtx.length,
            actualCtx.sampleRate
          );
          for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
            newBuffer.getChannelData(ch).set(decoded.getChannelData(ch));
          }

          clearTimeout(timeout);
          cleanup();

          // 转为 WAV DataURL
          const numChannels = newBuffer.numberOfChannels;
          const sampleRate = newBuffer.sampleRate;
          const length = newBuffer.length;
          const wavData = new ArrayBuffer(44 + length * numChannels * 2);
          const view = new DataView(wavData);

          writeString(view, 0, 'RIFF');
          view.setUint32(4, 36 + length * numChannels * 2, true);
          writeString(view, 8, 'WAVE');
          writeString(view, 12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, numChannels, true);
          view.setUint32(24, sampleRate, true);
          view.setUint32(28, sampleRate * numChannels * 2, true);
          view.setUint16(32, numChannels * 2, true);
          view.setUint16(34, 16, true);
          writeString(view, 36, 'data');
          view.setUint32(40, length * numChannels * 2, true);

          let offset = 44;
          for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
              const sample = Math.max(-1, Math.min(1, newBuffer.getChannelData(ch)[i]));
              view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
              offset += 2;
            }
          }

          const blob = new Blob([wavData], { type: 'audio/wav' });
          const reader = new FileReader();
          reader.onload = () => resolve({ blob, dataUrl: reader.result as string });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);

        } catch (decodeErr) {
          console.warn('Audio decode failed, fallback to raw import:', decodeErr);
          clearTimeout(timeout);
          cleanup();
          // 解码失败则直接当原始文件导入
          const reader = new FileReader();
          reader.onload = () => resolve({ blob: file, dataUrl: reader.result as string });
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        }
      })
      .catch((err) => {
        console.error('Fetch/decode error:', err);
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      });
  });
};

const writeString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
};

/** 波形图绘制 Canvas 组件 */
function WaveformCanvas({ waveformData, progress, color, height = 60 }: {
  waveformData: Float32Array | null;
  progress: number; // 0~1
  color?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barCount = Math.min(waveformData.length, w);
    const step = waveformData.length / barCount;
    const barW = Math.max(0.8, w / barCount - 0.5);
    const baseColor = color || '#3b82f6';

    for (let i = 0; i < barCount; i++) {
      const idx = Math.floor(i * step);
      const val = waveformData[idx] || 0;
      const barH = Math.max(1.5, val * h * 0.85);
      const x = (i / barCount) * w + (w / barCount - barW) / 2;

      const played = (i / barCount) <= progress;
      ctx.fillStyle = played ? baseColor : `${baseColor}30`;
      ctx.fillRect(x, (h - barH) / 2, barW, barH);
    }

    // 进度指示线
    if (progress > 0 && progress < 1) {
      const px = progress * w;
      ctx.strokeStyle = `${baseColor}80`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [waveformData, progress, color, height]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={height}
      className="w-full"
      style={{ height }}
    />
  );
}

// --- Components ---

/** 智能识别文件缩略图管理器 - 统一管理 object URL 生命周期 */
function SmartFileThumbnails({ files }: { files: File[] }) {
  const thumbs = useMemo(() => {
    return files.map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mxf'];
      if (imageExts.includes(ext) || videoExts.includes(ext)) {
        return URL.createObjectURL(file);
      }
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => {
    return () => {
      thumbs.forEach(url => { if (url) URL.revokeObjectURL(url); });
    };
  }, [thumbs]);

  useEffect(() => {
    const el = document.getElementById('smart-thumb-data');
    if (el) (el as any).__thumbs = thumbs;
  }, [thumbs]);

  return <div id="smart-thumb-data" style={{ display: 'none' }} />;
}

export default function App() {
  // --- State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>('Storyboard');
  const [versions, setVersions] = useState<Version[]>([]);
  const [allShotVersions, setAllShotVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allProjectTasks, setAllProjectTasks] = useState<Task[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playableUrl, setPlayableUrl] = useState<string | null>(null);
  
  const [shotSearch, setShotSearch] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [smartFiles, setSmartFiles] = useState<File[]>([]);
  const [showSmartDialog, setShowSmartDialog] = useState(false);
  const [smartTargetShot, setSmartTargetShot] = useState<Shot | null>(null);
  const [isSmartProcessing, setIsSmartProcessing] = useState(false);
  // 压缩包解压后的文件列表
  const [zipExtractedFiles, setZipExtractedFiles] = useState<Array<{
    name: string;
    blob: Blob;
    type: 'video' | 'image' | 'audio' | 'other';
    thumbUrl?: string;
    size: number;
    assignedStage?: string;
  }>>([]);
  const [isZipExtracting, setIsZipExtracting] = useState(false);
  // 拖拽中的文件索引（高亮用）
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  // 悬停的阶段（drop target 高亮）
  const [hoveredDropStage, setHoveredDropStage] = useState<string | null>(null);
  const [aiChat, setAiChat] = useState<{role: 'user' | 'bot', text: string}[]>([]);
  const [aiInput, setAiInput] = useState('');


  const [isProjectSelection, setIsProjectSelection] = useState(true);
  const [isBatchAddingShots, setIsBatchAddingShots] = useState(false);
  const [batchShotCount, setBatchShotCount] = useState(1);
  
  const [isAddingProjectModal, setIsAddingProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isAddingShotModal, setIsAddingShotModal] = useState(false);
  const [newShotName, setNewShotName] = useState('');
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<Project | null>(null);
  
  const [isRVPlayerOpen, setIsRVPlayerOpen] = useState(false);
  const [rvVersion, setRvVersion] = useState<Version | null>(null);
  const [rvPlayableUrl, setRvPlayableUrl] = useState<string | null>(null);
  const [rvIsPlaying, setRvIsPlaying] = useState(false);
  const [rvCurrentTime, setRvCurrentTime] = useState(0);
  const [rvDuration, setRvDuration] = useState(0);
  
  const [rvScale, setRvScale] = useState(1);
  const [rvOffset, setRvOffset] = useState({ x: 0, y: 0 });
  const [rvBrightness, setRvBrightness] = useState(100);
  const [rvContrast, setRvContrast] = useState(100);
  const [rvSaturation, setRvSaturation] = useState(100);
  const [rvPlaybackRate, setRvPlaybackRate] = useState(1);
  const [rvIsLooping, setRvIsLooping] = useState(false);
  const [rvABPoints, setRvABPoints] = useState<{ a: number | null, b: number | null }>({ a: null, b: null });
  const [isABLooping, setIsABLooping] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubStartX, setScrubStartX] = useState(0);
  const [scrubStartTime, setScrubStartTime] = useState(0);
  const [hoveredShotId, setHoveredShotId] = useState<number | null>(null);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [hoveredVersionId, setHoveredVersionId] = useState<number | null>(null);

  // --- Video Compare (版本对比) States ---
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<Version | null>(null);  // 主版本（默认当前选中）
  const [compareVersionB, setCompareVersionB] = useState<Version | null>(null);  // 对比版本（用户另选）
  const [compareMode, setCompareMode] = useState<'side-by-side' | 'overlay' | 'swipe'>('side-by-side');
  const [compareIsPlaying, setCompareIsPlaying] = useState(false);
  const [compareCurrentTime, setCompareCurrentTime] = useState(0);
  const [compareDuration, setCompareDuration] = useState(0);
  const [comparePlaybackRate, setComparePlaybackRate] = useState(1);
  const [compareBrightness, setCompareBrightness] = useState(100);
  const [compareLooping, setCompareLooping] = useState(false);
  const [compareOverlayOpacity, setCompareOverlayOpacity] = useState(0.5);   // 叠加模式透明度
  const [compareSwipePos, setCompareSwipePos] = useState(50);                  // 拖动对比位置(百分比)
  const compareVideoRefA = useRef<HTMLVideoElement>(null);
  const compareVideoRefB = useRef<HTMLVideoElement>(null);

  // --- Shot Detection States ---
  const [isShotDetectionModal, setIsShotDetectionModal] = useState(false);
  const [detectionVideoFile, setDetectionVideoFile] = useState<File | null>(null);
  const [detectionVideoUrl, setDetectionVideoUrl] = useState<string | null>(null);
  const [detectedCuts, setDetectedCuts] = useState<number[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [isDraggingCut, setIsDraggingCut] = useState<number | null>(null);
  const [isCreatingFromCuts, setIsCreatingFromCuts] = useState(false);

  // --- Creative Panel States ---
  const [isCreativePanelOpen, setIsCreativePanelOpen] = useState(false);
  const [creativeActiveTab, setCreativeActiveTab] = useState<string | null>(null);
  const [creativePanelRefs, setCreativePanelRefs] = useState<Reference[]>([]);
  const [isCreativePanelModal, setIsCreativePanelModal] = useState(false);
  const [creativeModalTab, setCreativeModalTab] = useState<string>('image-ref');
  // shot级创意面板：独立state，与全局面板数据/状态完全隔离
  const [isShotCreativeModal, setIsShotCreativeModal] = useState(false);
  const [shotCreativeTab, setShotCreativeTab] = useState<string>('image-ref');
  const [shotCreativeRefs, setShotCreativeRefs] = useState<Reference[]>([]);
  const [isStringoutModal, setIsStringoutModal] = useState(false);
  const [stringoutVersions, setStringoutVersions] = useState<Version[]>([]);
  const [stringoutOrder, setStringoutOrder] = useState<number[]>([]);
  const [isStringoutPlaying, setIsStringoutPlaying] = useState(false);
  const [stringoutCurrentIdx, setStringoutCurrentIdx] = useState(0);
  // 串片阶段选择对话框
  const [isStagePickerOpen, setIsStagePickerOpen] = useState(false);

  // --- Shot Creative Stage States (PureRef Board) ---
  const [shotImageRefs, setShotImageRefs] = useState<Reference[]>([]);
  const [shotVideoRefs, setShotVideoRefs] = useState<Reference[]>([]);
  // ========== PureRef2-style Image Board States ==========
  const [boardZoom, setBoardZoom] = useState(1);
  const [boardPan, setBoardPan] = useState({ x: 60, y: 40 });
  const [isBoardPanning, setIsBoardPanning] = useState(false);
  const [boardPanStart, setBoardPanStart] = useState({ x: 0, y: 0 });
  // 图片位置（按shotId隔离存储，key=ref.id）
  const [imgPositions, setImgPositions] = useState<Record<number, { x: number; y: number; w: number; h: number }>>({});
  // 拖拽中
  const [draggingImgId, setDraggingImgId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  // 缩放中
  const [resizingImgId, setResizingImgId] = useState<number | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, ix: 0, iy: 0 });
  // 选择（支持多选 Ctrl+点击 / Shift+点击）
  const [selectedImgIds, setSelectedImgIds] = useState<Set<number>>(new Set());
  // 画布背景色
  const [boardBgColor, setBoardBgColor] = useState('#1e1e1e');
  const boardContainerRef = useRef<HTMLDivElement>(null);

  // ===== 全局创意面板（Modal）PureRef2 画布状态（独立于shot级别） =====
  const [globalBoardZoom, setGlobalBoardZoom] = useState(1);
  const [globalBoardPan, setGlobalBoardPan] = useState({ x: 60, y: 40 });
  const [isGlobalBoardPanning, setIsGlobalBoardPanning] = useState(false);
  const [globalBoardPanStart, setGlobalBoardPanStart] = useState({ x: 0, y: 0 });
  const [globalImgPositions, setGlobalImgPositions] = useState<Record<number, { x: number; y: number; w: number; h: number }>>({});
  const [globalDraggingId, setGlobalDraggingId] = useState<number | null>(null);
  const [globalDragOffset, setGlobalDragOffset] = useState({ x: 0, y: 0 });
  const [globalResizingId, setGlobalResizingId] = useState<number | null>(null);
  const [globalResizeStart, setGlobalResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, ix: 0, iy: 0 });
  const [globalSelectedIds, setGlobalSelectedIds] = useState<Set<number>>(new Set());
  const [globalSelectionBox, setGlobalSelectionBox] = useState({ start: { x: null as number | null, y: null as number | null }, end: { x: 0, y: 0 } });
  const [globalBoardBgColor, setGlobalBoardBgColor] = useState('#1e1e1e');
  const globalBoardContainerRef = useRef<HTMLDivElement>(null);
  // 全局画布localStorage key（不绑定shot）
  const GLOBAL_BOARD_KEY = 'cineflow_global_board';

  // 其他状态（视频预览、上下文菜单等）
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; refId: number } | null>(null);
  const [hoveredVideoRefId, setHoveredVideoRefId] = useState<number | null>(null);
  const creativeFileInputRef = useRef<HTMLInputElement>(null);
  const [stringoutVideoRef] = useState<{ current: HTMLVideoElement | null }>({ current: null });
  const [isExportingDaVinci, setIsExportingDaVinci] = useState(false);

  // 音频波形图播放状态
  const [audioPlayingRefId, setAudioPlayingRefId] = useState<number | null>(null);
  const [audioProgressMap, setAudioProgressMap] = useState<Record<number, number>>({});
  const [waveformCache, setWaveformCache] = useState<Record<number, Float32Array>>({});
  const audioElsRef = useRef<Map<number, HTMLAudioElement>>(new Map());

  const videoRef = useRef<HTMLVideoElement>(null);
  const rvVideoRef = useRef<HTMLVideoElement>(null);
  // compareVideoRefA / compareVideoRefB 已在上面（第371-372行）定义，此处不再重复
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shotImportRef = useRef<HTMLInputElement>(null);
  const creativePanelHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creativeTabHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Effects ---

  // Load Projects
  useEffect(() => {
    const load = async () => {
      const all = await db.projects.toArray();
      setProjects(all);
      if (all.length > 0) {
        // If there are projects, we still show selection unless one was active
        // For now, let's keep isProjectSelection true by default if no project is selected
      }
    };
    load();
  }, []);

  // Load Shots for Project
  useEffect(() => {
    if (selectedProject?.id) {
      const load = async () => {
        const projShots = await db.shots.where('projectId').equals(selectedProject.id!).toArray();
        setShots(projShots);
        // Load all tasks for this project (for shot list status display)
        const projTasks = await db.tasks.where('shotId').anyOf(projShots.map(s => s.id!)).toArray();
        setAllProjectTasks(projTasks);
        if (projShots.length > 0 && !selectedShot) setSelectedShot(projShots[0]);
      };
      load();
    }
  }, [selectedProject]);

  // Load Creative Panel References
  useEffect(() => {
    const load = async () => {
      // 音效库是全局共享的，总是加载
      const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
      
      if (selectedProject?.id) {
        const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
        setCreativePanelRefs([...projRefs, ...sfxRefs]);
        
        // 图片参考tab：仅加载项目级全局图片（shotId为空的），与镜头级数据完全隔离
        if (creativeModalTab === 'image-ref') {
          const globalImgRefs = projRefs.filter(r => r.category === 'image-ref' && r.type === 'image' && !r.shotId);
          await loadGlobalBoardPositions(globalImgRefs);
        }
      } else {
        setCreativePanelRefs(sfxRefs);
      }
    };
    load();
  }, [selectedProject, isCreativePanelModal, creativeModalTab]);

  // Load Shot-level Creative Panel References — shot级（制作阶段创意面板），完全独立的数据源
  useEffect(() => {
    const load = async () => {
      if (!isShotCreativeModal || !selectedShot?.id) {
        setShotCreativeRefs([]);
        return;
      }
      const shotRefs = await db.references.where('shotId').equals(selectedShot.id).toArray();
      setShotCreativeRefs(shotRefs);
    };
    load();
  }, [isShotCreativeModal, selectedShot?.id]);

  // Load ALL versions for the current project (for shot thumbnails, stage version counts)
  useEffect(() => {
    if (selectedProject?.id) {
      const load = async () => {
        const projShots = await db.shots.where('projectId').equals(selectedProject.id!).toArray();
        const shotIds = projShots.map(s => s.id!);
        if (shotIds.length === 0) {
          setAllShotVersions([]);
          return;
        }
        const allVers = await db.versions.where('shotId').anyOf(shotIds).toArray();
        setAllShotVersions(allVers);
      };
      load();
    } else {
      setAllShotVersions([]);
    }
  }, [selectedProject]);

  // Load Shot-level Creative References (for Creative Stage view)
  // 关键改进：只在shotId真正变化时才加载，防止反复触发导致位置抖动
  // --- Shot Creative Stage (PureRef Board) ---
  // 加载镜头参考素材 + 恢复画布位置
  useEffect(() => {
    if (!selectedShot?.id || selectedStage !== 'Creative') return;
    
    const shotId = selectedShot.id;

    let cancelled = false;
    
    const load = async () => {
      // 1. 从DB读取参考素材
      const shotRefs = await db.references.where('shotId').equals(shotId).toArray();
      if (cancelled) return;
      
      setShotImageRefs(shotRefs.filter(r => r.category === 'image-ref'));
      setShotVideoRefs(shotRefs.filter(r => r.category === 'video-ref'));
      
      const imgRefs = shotRefs.filter(r => r.category === 'image-ref');
      if (imgRefs.length === 0) {
        setImgPositions({});
        return;
      }
      
      // 2. 优先从 localStorage 恢复位置
      const storageKey = `cineflow_board_${shotId}`;
      let saved: Record<number, { x: number; y: number; w: number; h: number }> | null = null;
      try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch(e) {}
      
      const result: Record<number, { x: number; y: number; w: number; h: number }> = saved || {};
      const needLoadDims: Array<{ ref: typeof imgRefs[0], index: number }> = [];
      
      // 3. 分类：已有位置的 vs 新图片（需要计算初始位置）
      for (let i = 0; i < imgRefs.length; i++) {
        const ref = imgRefs[i];
        if (!ref.id) continue;
        if (result[ref.id]) continue; // 已有缓存位置，跳过
        needLoadDims.push({ ref, index: Object.keys(result).length + needLoadDims.length });
      }
      
      // 4. 对新图片异步获取尺寸并分配位置
      for (const item of needLoadDims) {
        if (cancelled) break;
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 280, h: 200 });
          img.src = item.ref.url || item.ref.thumbnailUrl || '';
        });
        
        const maxW = 300;
        const ratio = dims.w / dims.h;
        const w = Math.min(dims.w, maxW);
        const h = w / ratio;
        
        const totalExisting = Object.keys(result).length;
        const cols = 3;
        result[item.ref.id!] = {
          x: 50 + (totalExisting % cols) * (maxW + 24),
          y: 50 + Math.floor(totalExisting / cols) * (h + 24),
          w,
          h: Math.round(h),
        };
      }
      
      if (!cancelled) {
        setImgPositions(result);
        try { localStorage.setItem(storageKey, JSON.stringify(result)); } catch(e) {}
      }
    };
    
    load();
    
    return () => { cancelled = true; };
  }, [selectedShot?.id, selectedStage]);


  // Load Tasks & Versions for Shot
  useEffect(() => {
    if (selectedShot?.id) {
      const load = async () => {
        const shotTasks = await db.tasks.where('shotId').equals(selectedShot.id!).toArray();
        setTasks(shotTasks);
        
        const shotVersions = await db.versions
          .where('shotId').equals(selectedShot.id!)
          .and(v => v.stageName === selectedStage)
          .sortBy('versionNumber');
        
        const sorted = shotVersions.reverse();
        setVersions(sorted);
        if (sorted.length > 0) setSelectedVersion(sorted[0]);
        else setSelectedVersion(null);
      };
      load();
    }
  }, [selectedShot, selectedStage]);

  // Handle Shot Detection Cut Dragging
  useEffect(() => {
    if (isDraggingCut === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      const timeline = document.querySelector('.group\\/timeline');
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;
      
      setDetectedCuts(prev => {
        const next = [...prev];
        next[isDraggingCut] = time;
        return next.sort((a, b) => a - b);
      });
      
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    };

    const handleMouseUp = () => {
      setIsDraggingCut(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCut, duration]);

  useEffect(() => {
    if (rvVideoRef.current) {
      rvVideoRef.current.playbackRate = rvPlaybackRate;
    }
  }, [rvPlaybackRate]);

  // Handle RV Play/Pause
  useEffect(() => {
    if (rvVideoRef.current) {
      if (rvIsPlaying) {
        rvVideoRef.current.play().catch(() => {});
      } else {
        rvVideoRef.current.pause();
      }
    }
  }, [rvIsPlaying]);

  // ===== Video Compare Effects (版本对比控制) =====
  // 对比倍速同步
  useEffect(() => {
    if (compareVideoRefA.current) compareVideoRefA.current.playbackRate = comparePlaybackRate;
    if (compareVideoRefB.current) compareVideoRefB.current.playbackRate = comparePlaybackRate;
  }, [comparePlaybackRate]);
  // 对比播放/暂停同步（两个视频同时播放）
  useEffect(() => {
    if (compareIsPlaying) {
      compareVideoRefA.current?.play().catch(() => {});
      compareVideoRefB.current?.play().catch(() => {});
    } else {
      compareVideoRefA.current?.pause();
      compareVideoRefB.current?.pause();
    }
  }, [compareIsPlaying]);
  // 对比时间更新（以 A 视频为主，同步 B）
  const handleCompareTimeUpdate = () => {
    if (!compareVideoRefA.current || !compareVideoRefB.current) return;
    const timeA = compareVideoRefA.current.currentTime;
    const timeB = compareVideoRefB.current.currentTime;
    setCompareCurrentTime(timeA);
    // 同步 B 视频到 A（允许微小误差避免死循环）
    if (Math.abs(timeA - timeB) > 0.05) {
      compareVideoRefB.current.currentTime = timeA;
    }
    // 循环
    if (compareLooping && timeA >= (compareVideoRefA.current.duration || 0) - 0.1) {
      compareVideoRefA.current.currentTime = 0;
      compareVideoRefB.current.currentTime = 0;
      compareVideoRefA.current.play().catch(() => {});
      compareVideoRefB.current.play().catch(() => {});
    }
  };
  // 打开对比弹窗
  const openCompare = (versionA: Version) => {
    setCompareVersionA(versionA);
    // 默认选不同版本的最新一个作为对比
    const otherVersions = versions.filter(v => v.id !== versionA.id);
    setCompareVersionB(otherVersions.length > 0 ? otherVersions[0] : null);
    setIsCompareOpen(true);
    setCompareIsPlaying(false);
    setCompareCurrentTime(0);
    setComparePlaybackRate(1);
    setCompareBrightness(100);
    setCompareLooping(false);
    setCompareMode('side-by-side');
  };
  // 对比 seek
  const handleCompareSeek = (time: number) => {
    if (compareVideoRefA.current) compareVideoRefA.current.currentTime = time;
    if (compareVideoRefB.current) compareVideoRefB.current.currentTime = time;
    setCompareCurrentTime(time);
  };

  // Handle RV A-B Loop
  const handleRvTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const time = video.currentTime;
    setRvCurrentTime(time);

    if (isABLooping && rvABPoints.a !== null && rvABPoints.b !== null) {
      const start = Math.min(rvABPoints.a, rvABPoints.b);
      const end = Math.max(rvABPoints.a, rvABPoints.b);
      if (time >= end) {
        video.currentTime = start;
      }
    } else if (rvIsLooping && time >= video.duration - 0.1) {
      video.currentTime = 0;
      video.play();
    }
  };

  // Handle RV Version Change
  useEffect(() => {
    if (rvVersion) {
      if (rvVersion.videoBlob) {
        const url = URL.createObjectURL(rvVersion.videoBlob as any);
        setRvPlayableUrl(url);
        return () => URL.revokeObjectURL(url);
      } else {
        setRvPlayableUrl(rvVersion.videoUrl);
      }
      setRvIsPlaying(false);
      setRvCurrentTime(0);
      setRvPlaybackRate(1);
      setRvABPoints({ a: null, b: null });
      setIsABLooping(false);
    } else {
      setRvPlayableUrl(null);
    }
  }, [rvVersion]);

  // Handle Video Playback
  useEffect(() => {
    if (selectedVersion) {
      if (selectedVersion.videoBlob) {
        const url = URL.createObjectURL(selectedVersion.videoBlob as any);
        setPlayableUrl(url);
        return () => URL.revokeObjectURL(url);
      } else {
        setPlayableUrl(selectedVersion.videoUrl);
      }
    } else {
      setPlayableUrl(null);
    }
  }, [selectedVersion]);

  // Sync Video State
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.play().catch(e => console.error("Play error:", e));
      else videoRef.current.pause();
    }
  }, [isPlaying, playableUrl]);

  // RV Player Sync
  useEffect(() => {
    if (rvVideoRef.current) {
      if (rvIsPlaying) rvVideoRef.current.play().catch(e => console.error("RV Play error:", e));
      else rvVideoRef.current.pause();
    }
  }, [rvIsPlaying, rvPlayableUrl]);


  // --- Handlers ---

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    const id = await db.projects.add({
      name: newProjectName.trim(),
      description: '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const newProj = await db.projects.get(id);
    if (newProj) {
      setProjects([...projects, newProj]);
      setSelectedProject(newProj);
      setIsProjectSelection(false);
      setIsAddingProjectModal(false);
      setNewProjectName('');
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!project.id) return;
    
    // Delete all shots for this project (cascade)
    const projShots = await db.shots.where('projectId').equals(project.id).toArray();
    for (const shot of projShots) {
      // Delete tasks, versions, annotations for each shot
      await db.tasks.where('shotId').equals(shot.id!).delete();
      const shotVersions = await db.versions.where('shotId').equals(shot.id!).toArray();
      for (const ver of shotVersions) {
        await db.annotations.where('versionId').equals(ver.id!).delete();
      }
      await db.versions.where('shotId').equals(shot.id!).delete();
    }
    await db.shots.where('projectId').equals(project.id).delete();
    
    // Delete project-level references (except sfx-lib which is global/shared)
    await db.references
      .where('projectId').equals(project.id)
      .and(r => r.category !== 'sfx-lib')
      .delete();
    
    // Delete the project itself
    await db.projects.delete(project.id);
    
    // Update state
    const updatedProjects = projects.filter(p => p.id !== project.id);
    setProjects(updatedProjects);
    
    if (selectedProject?.id === project.id) {
      if (updatedProjects.length > 0) {
        setSelectedProject(updatedProjects[0]);
      } else {
        setSelectedProject(null);
        setIsProjectSelection(true);
      }
    }
    
    setDeleteConfirmProject(null);
  };

  const getNextShotName = (existingShots: Shot[]) => {
    const abbr = selectedProject ? getProjectAbbr(selectedProject.name) : 'CF';
    const maxNum = existingShots.reduce((max, s) => {
      const match = s.name.match(/SH(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    const nextNum = maxNum === 0 ? 10 : maxNum + 10;
    return `${abbr}_SH${nextNum.toString().padStart(3, '0')}`;
  };

  const handleAddShot = async () => {
    if (!selectedProject?.id) return;
    
    const name = newShotName.trim();
    if (!name) return;

    const id = await db.shots.add({
      projectId: selectedProject.id,
      name,
      description: '',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Add default tasks
    const taskPromises = DEFAULT_STAGES.map(s => db.tasks.add({
      shotId: id,
      name: s,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    await Promise.all(taskPromises);

    const newShot = await db.shots.get(id);
    if (newShot) {
      setShots([...shots, newShot]);
      setSelectedShot(newShot);
      setIsAddingShotModal(false);
      setNewShotName('');
    }
  };

  const handleBatchAddShots = async (count?: number) => {
    const actualCount = count ?? batchShotCount;
    if (!selectedProject?.id || actualCount <= 0) return;
    
    setIsAiLoading(true);
    try {
      const existingShots = await db.shots.where('projectId').equals(selectedProject.id).toArray();
      let lastNum = existingShots.reduce((max, s) => {
        const match = s.name.match(/SH(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      const abbr = getProjectAbbr(selectedProject.name);
      
      const newShotsData = [];
      for (let i = 0; i < actualCount; i++) {
        lastNum += 10;
        const name = `${abbr}_SH${lastNum.toString().padStart(3, '0')}`;
        newShotsData.push({
          projectId: selectedProject.id,
          name,
          description: '',
          status: 'pending' as const,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      for (const shotData of newShotsData) {
        const id = await db.shots.add(shotData);
        const taskPromises = DEFAULT_STAGES.map(s => db.tasks.add({
          shotId: id,
          name: s,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        await Promise.all(taskPromises);
      }

      const updatedShots = await db.shots.where('projectId').equals(selectedProject.id).toArray();
      setShots(updatedShots);
      setIsBatchAddingShots(false);
      setBatchShotCount(1);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleStageStatusChange = async (stageName: string, newStatus: 'pending' | 'in-progress' | 'review' | 'approved') => {
    if (!selectedShot?.id) return;
    const task = tasks.find(t => t.name === stageName);
    if (task?.id) {
      await db.tasks.update(task.id, { status: newStatus, updatedAt: new Date() });
    }
    // Refresh both selected shot tasks and all project tasks
    const shotTasks = await db.tasks.where('shotId').equals(selectedShot.id).toArray();
    setTasks(shotTasks);
    if (selectedProject?.id) {
      const projShots = await db.shots.where('projectId').equals(selectedProject.id).toArray();
      const projTasks = await db.tasks.where('shotId').anyOf(projShots.map(s => s.id!)).toArray();
      setAllProjectTasks(projTasks);
    }
  };

  const openRVPlayer = (version: Version) => {
    setRvVersion(version);
    setIsRVPlayerOpen(true);
    setRvBrightness(100);
    setRvContrast(100);
    setRvSaturation(100);
    // Auto-switch to the version's stage
    if (version.stageName && DEFAULT_STAGES.includes(version.stageName)) {
      setSelectedStage(version.stageName);
    }
  };

  const stepFrame = (direction: number) => {
    if (rvVideoRef.current) {
      const fps = rvVersion?.metadata?.fps || 24;
      rvVideoRef.current.currentTime += (direction / fps);
    }
  };

  const handleScrubMouseDown = (e: React.MouseEvent) => {
    // Only start scrubbing if clicking on the viewport or background, not on buttons/controls
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('aside')) return;

    if (rvVideoRef.current) {
      setIsScrubbing(true);
      setScrubStartX(e.clientX);
      setScrubStartTime(rvVideoRef.current.currentTime);
      setRvIsPlaying(false);
    }
  };

  const handleScrubMouseMove = (e: React.MouseEvent) => {
    if (isScrubbing && rvVideoRef.current && rvDuration) {
      const deltaX = e.clientX - scrubStartX;
      const sensitivity = 0.05; 
      let newTime = scrubStartTime + (deltaX * sensitivity);
      newTime = Math.max(0, Math.min(newTime, rvDuration));
      rvVideoRef.current.currentTime = newTime;
      setRvCurrentTime(newTime); // Update state immediately for UI feedback
    }
  };

  const handleScrubMouseUp = () => {
    setIsScrubbing(false);
  };

  const detectSceneCuts = async (file: File) => {
    setIsDetecting(true);
    setDetectionProgress(0);
    setDetectedCuts([]);
    
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });

      const duration = video.duration;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      canvas.width = 32;
      canvas.height = 32;

      const cuts: number[] = [0];
      let lastFrameData: Uint8ClampedArray | null = null;
      
      // Adaptive thresholding parameters
      const step = 0.15; // Balance between speed and accuracy
      const differences: number[] = [];
      
      for (let t = 0; t < duration; t += step) {
        video.currentTime = t;
        await new Promise((resolve) => (video.onseeked = resolve));
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        
        if (lastFrameData) {
          let diff = 0;
          // Compare every pixel (32x32 = 1024 pixels, very fast)
          for (let i = 0; i < currentFrameData.length; i += 4) {
            const rDiff = Math.abs(currentFrameData[i] - lastFrameData[i]);
            const gDiff = Math.abs(currentFrameData[i + 1] - lastFrameData[i + 1]);
            const bDiff = Math.abs(currentFrameData[i + 2] - lastFrameData[i + 2]);
            // Luminance-weighted difference for better accuracy
            diff += (rDiff * 0.299 + gDiff * 0.587 + bDiff * 0.114);
          }
          
          const normalizedDiff = diff / (canvas.width * canvas.height);
          differences.push(normalizedDiff);

          // Detect spikes relative to local average
          if (differences.length > 5) {
            const localAvg = differences.slice(-5, -1).reduce((a, b) => a + b, 0) / 4;
            const threshold = Math.max(localAvg * 3, 35); // Adaptive threshold with floor
            
            if (normalizedDiff > threshold && (t - cuts[cuts.length - 1] > 0.5)) {
              cuts.push(t);
            }
          }
        }
        
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        setDetectionProgress((t / duration) * 100);
      }
      
      setDetectedCuts(cuts);
    } catch (err) {
      console.error('Detection failed:', err);
    } finally {
      setIsDetecting(false);
      URL.revokeObjectURL(url);
    }
  };

  const handleProjectDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      setDetectionVideoFile(file);
      setDetectionVideoUrl(URL.createObjectURL(file));
      setIsShotDetectionModal(true);
      detectSceneCuts(file);
    }
  };

  const handleCreateFromCuts = async (targetProject?: Project) => {
    const project = targetProject || selectedProject;
    if (!detectionVideoFile || !project) return;
    setIsCreatingFromCuts(true);
    
    try {
      // 排序剪辑点
      const sortedCuts = [...detectedCuts].sort((a, b) => a - b);
      const abbr = getProjectAbbr(project.name);
      
      // 预加载原始视频用于缩略图和元数据
      const sourceVideoUrl = URL.createObjectURL(detectionVideoFile);
      
      // 先获取视频总时长（用于最后一个镜头的结束时间）
      const videoDuration = await new Promise<number>((r) => {
        const v = document.createElement('video');
        v.src = sourceVideoUrl;
        v.onloadedmetadata = () => { r(v.duration); v.remove(); };
        v.onerror = () => { r(0); v.remove(); };
      });

      // 逐个处理镜头（串行切分，避免多个 MediaRecorder 并发导致内存问题）
      const createdShots: { shotId: number; name: string; hasClip: boolean }[] = [];
      
      for (let index = 0; index < sortedCuts.length; index++) {
        const startTime = sortedCuts[index];
        const endTime = index < sortedCuts.length - 1 ? sortedCuts[index + 1] : videoDuration;
        const shotNum = (index + 1) * 10;
        const name = `${abbr}_SH${String(shotNum).padStart(3, '0')}`;
        
        // 1. 创建 Shot 记录
        const shotId = await db.shots.add({
          projectId: project.id!,
          name,
          description: `自动检测镜头 ${index + 1} [${formatTime(startTime)} - ${formatTime(endTime)}]`,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // 2. 创建默认阶段任务（所有9个阶段）
        await Promise.all(DEFAULT_STAGES.map(stage => db.tasks.add({
          shotId: shotId as number,
          name: stage,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })));

        // 3. 生成缩略图（取该镜头起始帧画面）
        let thumb: string | null = null;
        try {
          thumb = await generateThumbnail(sourceVideoUrl, startTime);
          if (thumb) await db.shots.update(shotId as number, { thumbnailUrl: thumb });
        } catch {}

        // 4. 切分视频片段并创建 Version 记录
        let hasClip = false;
        try {
          const segmentBlob = await extractVideoSegment(detectionVideoFile, startTime, Math.min(endTime, startTime + 180));
          
          if (segmentBlob && segmentBlob.size > 1000) {
            hasClip = true;
            const segFile = new File([segmentBlob], `${name}_clip.webm`, { type: segmentBlob.type });
            
            // 将片段关联到 Storyboard（分镜）阶段
            await db.versions.add({
              shotId: shotId as number,
              name: `${name}_clip`,
              stageName: 'Storyboard',  // ← 放入分镜阶段
              versionNumber: 1,
              videoUrl: '',
              videoBlob: segFile,
              thumbnailUrl: thumb || undefined,
              notes: `自动切分: ${formatTime(startTime)} → ${formatTime(Math.min(endTime, startTime+180))}`,
              metadata: {
                fps: 30,
                duration: Math.min(endTime, startTime + 180) - startTime,
                resolution: '',
                fileSize: segFile.size,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        } catch (segErr) {
          console.warn(`[Shot ${name}] 切分失败:`, segErr);
        }

        createdShots.push({ shotId: shotId as number, name, hasClip });
        
        // 更新进度提示（通过 detectionProgress 复用显示当前处理到第几个镜头）
        setDetectionProgress(((index + 1) / sortedCuts.length) * 100);
      }

      // 清理临时 URL
      URL.revokeObjectURL(sourceVideoUrl);

      // === 关键：刷新数据并切换到新项目视图 ===
      
      // 5. 加载新项目的所有数据
      const projShots = await db.shots.where('projectId').equals(project.id!).toArray();
      setShots(projShots);
      
      // 加载任务数据
      const projTasks = await db.tasks.where('shotId').anyOf(projShots.map(s => s.id!)).toArray();
      setAllProjectTasks(projTasks);
      
      // 6. 选中第一个镜头
      if (projShots.length > 0) {
        setSelectedShot(projShots[0]);
        // 自动切换到分镜阶段（因为片段都在这里）
        setSelectedStage('Storyboard');
        // 触发版本列表加载（useEffect 会根据 selectedShot + selectedStage 加载 versions）
      }

      // 7. 关闭模态框
      setIsShotDetectionModal(false);
      setDetectionVideoFile(null);
      setDetectionVideoUrl(null);
      setDetectedCuts([]);

      // 8. 统计结果
      const clipCount = createdShots.filter(s => s.hasClip).length;
      const totalDuration = formatTime(videoDuration);
      
      alert(
        `✅ 镜头切分完成！\n\n` +
        `📁 项目：${project.name}\n` +
        `🎬 共生成 ${createdShots.length} 个镜头\n` +
        `📹 成功切分 ${clipCount} 个视频片段\n` +
        `⏱️ 原片总时长：${totalDuration}\n\n` +
        `已自动切换到「分镜」阶段，点击任意镜头即可查看对应片段。`
      );
      
    } catch (err) {
      console.error('Failed to create shots from cuts:', err);
      alert('❌ 镜头生成过程中出错，请重试。\n' + String(err));
    } finally {
      setIsCreatingFromCuts(false);
      setDetectionProgress(0);
    }
  };

  const handleUploadVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedShot?.id) return;

    setIsAiLoading(true);
    try {
      const videoUrl = URL.createObjectURL(file);
      const thumb = await generateThumbnail(videoUrl, 0.5); // Middle frame of first second
      const meta = await getVideoMetadata(videoUrl, file);
      
      const existing = await db.versions
        .where('shotId').equals(selectedShot.id)
        .and(v => v.stageName === selectedStage)
        .toArray();
      
      const nextVer = existing.length + 1;
      
      const id = await db.versions.add({
        shotId: selectedShot.id,
        name: file.name,
        stageName: selectedStage,
        versionNumber: nextVer,
        videoUrl: '', // We use blob
        videoBlob: file,
        thumbnailUrl: thumb || undefined,
        notes: '',
        metadata: meta || undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Update shot thumbnail if not already set or override with latest
      await db.shots.update(selectedShot.id, {
        thumbnailUrl: thumb || undefined,
        updatedAt: new Date()
      });
      const updatedShot = await db.shots.get(selectedShot.id);
      if (updatedShot) {
        setShots(prev => prev.map(s => s.id === updatedShot.id ? updatedShot : s));
        setSelectedShot(updatedShot);
      }

      const newVer = await db.versions.get(id);
      if (newVer) {
        setVersions([newVer, ...versions]);
        setSelectedVersion(newVer);
      }

      // Refresh allShotVersions for thumbnail updates
      if (selectedProject?.id) {
        const projShots = await db.shots.where('projectId').equals(selectedProject.id!).toArray();
        const allVers = await db.versions.where('shotId').anyOf(projShots.map(s => s.id!)).toArray();
        setAllShotVersions(allVers);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  // --- Smart File Recognition ---

  const classifyByExt = (filename: string): { type: 'video' | 'image' | 'audio' | 'other'; label: string; defaultStage: string } => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mxf'];
    if (videoExts.includes(ext)) return { type: 'video', label: '视频', defaultStage: 'Animation' };
    const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'exr', 'dpx', 'tiff', 'tga'];
    if (imgExts.includes(ext)) return { type: 'image', label: '图片', defaultStage: 'Creative' };
    const audioExts = ['wav', 'mp3', 'aac', 'ogg', 'flac', 'm4a'];
    if (audioExts.includes(ext)) return { type: 'audio', label: '音频', defaultStage: '' };
    return { type: 'other', label: ext.toUpperCase() || '文件', defaultStage: 'Asset' };
  };

  /** 生成图片缩略图的 object URL */
  const makeThumbUrl = async (blob: Blob, fileType: string): Promise<string | undefined> => {
    try {
      const url = URL.createObjectURL(blob);
      // 图片直接返回 URL
      if (fileType.startsWith('image/')) return url;
      // 视频取第一帧
      if (fileType.startsWith('video/')) {
        const thumb = await generateThumbnail(url, 0.5);
        URL.revokeObjectURL(url); // 视频原始 URL 不再需要
        return thumb || undefined;
      }
      URL.revokeObjectURL(url);
      return undefined;
    } catch {
      return undefined;
    }
  };

  /** 用 JSZip 解压压缩包 */
  const extractZipFile = async (file: File) => {
    setIsZipExtracting(true);
    setAiChat(prev => [...prev, { role: 'bot', text: `📦 正在解压 "${file.name}"，请稍候... 比比拉布` }]);
    try {
      const zip = await JSZip.loadAsync(file);
      const extracted = [];
      // 过滤掉 __MACOSX 和隐藏文件
      const validFiles = Object.keys(zip.files).filter(name =>
        !name.startsWith('__MACOSX') &&
        !name.startsWith('.') &&
        !zip.files[name].dir
      );

      for (const name of validFiles) {
        const zipEntry = zip.files[name];
        const blob = await zipEntry.async('blob');
        const info = classifyByExt(name);
        const thumbUrl = await makeThumbUrl(blob, blob.type);
        extracted.push({
          name: name.split('/').pop() || name, // 取文件名部分
          blob,
          type: info.type,
          thumbUrl,
          size: blob.size,
        });
      }

      setZipExtractedFiles(extracted);
      setAiChat(prev => [...prev, {
        role: 'bot',
        text: `✅ 解压完成！共 ${extracted.length} 个文件。拖拽文件到下方阶段区域即可导入。 比比拉布`
      }]);
    } catch (err) {
      console.error(err);
      setAiChat(prev => [...prev, { role: 'bot', text: `❌ 解压失败：${(err as Error).message} 比比拉布` }]);
    } finally {
      setIsZipExtracting(false);
    }
  };

  /** 判断是否为压缩包 */
  const isZipFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return ['zip'].includes(ext);
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSmartDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSmartFiles(files);
      setShowSmartDialog(true);
      setSmartTargetShot(selectedShot || null);
      // 如果是单个压缩包，自动解压
      if (files.length === 1 && isZipFile(files[0])) {
        extractZipFile(files[0]);
      }
    }
  };

  const handleSmartImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = async (ev) => {
      const files = Array.from((ev.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        setSmartFiles(files);
        setShowSmartDialog(true);
        setSmartTargetShot(selectedShot || null);
        setZipExtractedFiles([]);
        // 如果是单个压缩包，自动解压
        if (files.length === 1 && isZipFile(files[0])) {
          extractZipFile(files[0]);
        }
      }
    };
    input.click();
  };

  /** 智能识别：按文件类型自动分配到各阶段 */
  const handleAutoAssign = () => {
    const updated = zipExtractedFiles.map(f => {
      const info = classifyByExt(f.name);
      return { ...f, assignedStage: info.defaultStage || undefined };
    });
    setZipExtractedFiles(updated);
  };

  /** 处理拖拽释放到某个阶段 - 导入单个文件为版本 */
  const handleDropToStage = async (stageName: string) => {
    if (draggedFileIndex === null || !smartTargetShot?.id) return;
    const file = zipExtractedFiles[draggedFileIndex];
    if (!file) return;

    setDraggedFileIndex(null);

    try {
      if (file.type === 'video' || stageName === 'Animation' || stageName === 'Previs') {
        const videoUrl = file.thumbUrl || URL.createObjectURL(file.blob);
        const thumb = videoUrl.startsWith('blob:') ? await generateThumbnail(videoUrl, 0.5) : videoUrl;
        const meta = await getVideoMetadata(videoUrl, new File([file.blob], file.name, { type: file.blob.type }));
        const existing = await db.versions
          .where('shotId').equals(smartTargetShot.id)
          .and(v => v.stageName === stageName)
          .toArray();
        const nextVer = existing.length + 1;
        await db.versions.add({
          shotId: smartTargetShot.id,
          name: file.name,
          stageName: stageName,
          versionNumber: nextVer,
          videoUrl: '',
          videoBlob: new File([file.blob], file.name, { type: file.blob.type }),
          thumbnailUrl: thumb || undefined,
          notes: '',
          metadata: meta || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await db.shots.update(smartTargetShot.id, { thumbnailUrl: thumb || undefined });
        setAiChat(prev => [...prev, {
          role: 'bot',
          text: `🎬 "${file.name}" → ${STAGE_LABELS[stageName] || stageName} v${String(nextVer).padStart(3,'0')} 比比拉布`
        }]);
      } else {
        // 图片等作为参考素材导入
        const dataUrl = await readFileAsDataUrl(new File([file.blob], file.name));
        await db.references.add({
          shotId: smartTargetShot.id,
          projectId: selectedProject?.id,
          type: file.type === 'audio' ? 'audio' : 'image',
          category: stageName === 'Creative' ? 'image-ref' : 'asset-lib',
          url: dataUrl,
          name: file.name,
          notes: `压缩包导入 → ${STAGE_LABELS[stageName] || stageName}`,
          createdAt: new Date(),
        });
        setAiChat(prev => [...prev, {
          role: 'bot',
          text: `📎 "${file.name}" → ${STAGE_LABELS[stageName] || stageName} 比比拉布`
        }]);
      }

      // 标记该文件已分配
      setZipExtractedFiles(prev => prev.map((f, i) =>
        i === draggedFileIndex ? { ...f, assignedStage: stageName } : f
      ));

      refreshAllData();
    } catch (err) {
      console.error(err);
      setAiChat(prev => [...prev, { role: 'bot', text: `❌ 导入出错：${(err as Error).message} 比比拉布` }]);
    }
  };

  /** 批量导入所有已分配的文件（支持压缩包解压文件 + 普通文件） */
  const processAllAssigned = async () => {
    if (!smartTargetShot?.id) return;
    setIsSmartProcessing(true);

    // 判断是压缩包模式还是普通文件模式
    const isZipMode = zipExtractedFiles.length > 0;

    try {
      let count = 0;

      if (isZipMode) {
        // 压缩包解压后的文件
        for (let i = 0; i < zipExtractedFiles.length; i++) {
          const file = zipExtractedFiles[i];
          if (!file.assignedStage) continue;
          const stage = file.assignedStage;

          if (file.type === 'video' || stage === 'Animation' || stage === 'Previs') {
            const videoUrl = file.thumbUrl || URL.createObjectURL(file.blob);
            const thumb = videoUrl.startsWith('blob:') ? await generateThumbnail(videoUrl, 0.5) : videoUrl;
            const meta = await getVideoMetadata(videoUrl, new File([file.blob], file.name));
            const existing = await db.versions.where('shotId').equals(smartTargetShot.id).and(v => v.stageName === stage).toArray();
            const nextVer = existing.length + 1;
            await db.versions.add({
              shotId: smartTargetShot.id, name: file.name, stageName: stage,
              versionNumber: nextVer, videoUrl: '', videoBlob: new File([file.blob], file.name),
              thumbnailUrl: thumb || undefined, notes: '', metadata: meta || undefined,
              createdAt: new Date(), updatedAt: new Date(),
            });
            await db.shots.update(smartTargetShot.id, { thumbnailUrl: thumb || undefined });
            count++;
          } else {
            const dataUrl = await readFileAsDataUrl(new File([file.blob], file.name));
            await db.references.add({
              shotId: smartTargetShot.id, projectId: selectedProject?.id,
              type: file.type === 'audio' ? 'audio' : 'image',
              category: stage === 'Creative' ? 'image-ref' : 'asset-lib',
              url: dataUrl, name: file.name,
              notes: `智能导入 → ${STAGE_LABELS[stage] || stage}`, createdAt: new Date(),
            });
            count++;
          }
        }
      } else {
        // 普通文件（非压缩包）— 直接全部导入
        for (const file of smartFiles) {
          const info = classifyByExt(file.name);
          const targetStage = info.defaultStage || 'Animation';

          if (info.type === 'video') {
            const videoUrl = URL.createObjectURL(file);
            const thumb = await generateThumbnail(videoUrl, 0.5);
            const meta = await getVideoMetadata(videoUrl, file);
            const existing = await db.versions.where('shotId').equals(smartTargetShot.id).and(v => v.stageName === targetStage).toArray();
            const nextVer = existing.length + 1;
            await db.versions.add({
              shotId: smartTargetShot.id, name: file.name, stageName: targetStage,
              versionNumber: nextVer, videoUrl: '', videoBlob: file,
              thumbnailUrl: thumb || undefined, notes: '', metadata: meta || undefined,
              createdAt: new Date(), updatedAt: new Date(),
            });
            await db.shots.update(smartTargetShot.id, { thumbnailUrl: thumb || undefined });
            setAiChat(prev => [...prev, {
              role: 'bot', text: `🎬 "${file.name}" → ${STAGE_LABELS[targetStage]} v${String(nextVer).padStart(3,'0')} 比比拉布`
            }]);
          } else if (info.type === 'audio') {
            const dataUrl = await readFileAsDataUrl(file);
            await db.references.add({ shotId: undefined, projectId: undefined, type: 'audio', category: 'sfx-lib', url: dataUrl, name: file.name, notes: `智能导入`, createdAt: new Date() });
            setAiChat(prev => [...prev, { role: 'bot', text: `🔊 "${file.name}" → 音效库 比比拉布` }]);
          } else {
            const dataUrl = await readFileAsDataUrl(file);
            await db.references.add({ shotId: smartTargetShot.id, projectId: selectedProject?.id, type: 'image', category: targetStage === 'Creative' ? 'image-ref' : 'asset-lib', url: dataUrl, name: file.name, notes: `智能导入`, createdAt: new Date() });
            setAiChat(prev => [...prev, { role: 'bot', text: `🖼️ "${file.name}" → ${STAGE_LABELS[targetStage]} 比比拉布` }]);
          }
          count++;
        }
      }

      refreshAllData();

      if (isZipMode) {
        setAiChat(prev => [...prev, {
          role: 'bot', text: `✅ 批量导入完成！共 ${count}/${zipExtractedFiles.filter(f => f.assignedStage).length} 个文件已导入到 ${smartTargetShot.name} 比比拉布`
        }]);
      }
    } catch (err) {
      console.error(err);
      setAiChat(prev => [...prev, { role: 'bot', text: `❌ 批量导入出错：${(err as Error).message} 比比拉布` }]);
    } finally {
      setIsSmartProcessing(false);
      setShowSmartDialog(false);
      setSmartFiles([]);
      setZipExtractedFiles([]);
    }
  };

  /** 刷新所有数据（统一方法） */
  const refreshAllData = async () => {
    if (!selectedProject?.id) return;
    const projShots = await db.shots.where('projectId').equals(selectedProject!.id!).toArray();
    setShots(projShots);
    if (selectedShot?.id) {
      const projTasks = await db.tasks.where('shotId').anyOf(projShots.map(s => s.id!)).toArray();
      setAllProjectTasks(projTasks);
      const allVers = await db.versions.where('shotId').anyOf(projShots.map(s => s.id!)).toArray();
      setAllShotVersions(allVers);
      const shotTasks = await db.tasks.where('shotId').equals(selectedShot.id).toArray();
      setTasks(shotTasks);
      const shotVers = await db.versions.where('shotId').equals(selectedShot.id).and(v => v.stageName === selectedStage).sortBy('versionNumber');
      setVersions(shotVers.reverse());
      if (selectedStage === 'Creative' && selectedShot?.id) {
        const shotRefs = await db.references.where('shotId').equals(selectedShot.id).toArray();
        setShotImageRefs(shotRefs.filter(r => r.category === 'image-ref'));
        setShotVideoRefs(shotRefs.filter(r => r.category === 'video-ref'));
      }
    }
  };

  const handleAiChat = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiChat(prev => [...prev, {role: 'user', text: userMsg}]);
    setAiInput('');
    setIsAiLoading(true);

    try {
      const result = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are CineFlow AI, a production management assistant. 
        Context: Project ${selectedProject?.name}, Shot ${selectedShot?.name}, Stage ${selectedStage}.
        User says: ${userMsg}`
      });
      setAiChat(prev => [...prev, {role: 'bot', text: (result.text || "No response from AI.") + " 比比拉布"}]);
    } catch (err) {
      setAiChat(prev => [...prev, {role: 'bot', text: "Sorry, I encountered an error. 比比拉布"}]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- Creative Panel Handlers ---

  // 音频波形播放/暂停
  const toggleAudioPlay = (refId: number, url: string) => {
    // 如果正在播放这个音频 → 暂停
    if (audioPlayingRefId === refId) {
      const el = audioElsRef.current.get(refId);
      if (el) { el.pause(); setAudioPlayingRefId(null); }
      return;
    }
    // 停止其他正在播放的
    audioElsRef.current.forEach((el, id) => { el.pause(); });
    setAudioPlayingRefId(null);

    let audioEl = audioElsRef.current.get(refId);
    if (!audioEl) {
      audioEl = new Audio(url);
      audioEl.addEventListener('timeupdate', () => {
        if (audioEl && audioEl.duration) {
          setAudioProgressMap(prev => ({ ...prev, [refId]: audioEl!.currentTime / audioEl!.duration }));
        }
      });
      audioEl.addEventListener('ended', () => {
        setAudioPlayingRefId(null);
        setAudioProgressMap(prev => ({ ...prev, [refId]: 0 }));
        audioEl.currentTime = 0;
      });
      audioElsRef.current.set(refId, audioEl);
    }

    audioEl.currentTime = audioProgressMap[refId] * (audioEl.duration || 0) || 0;
    audioEl.play().then(() => setAudioPlayingRefId(refId)).catch(() => {});
  };

  // 音频波形拖拽 seek
  const handleWaveformSeek = (e: React.MouseEvent<HTMLCanvasElement>, refId: number) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setAudioProgressMap(prev => ({ ...prev, [refId]: progress }));
    const audioEl = audioElsRef.current.get(refId);
    if (audioEl && audioEl.duration) {
      audioEl.currentTime = progress * audioEl.duration;
    }
  };

  // 加载波形数据（带缓存）
  const loadWaveform = async (refId: number, url: string, isVideoSource?: boolean) => {
    if (waveformCache[refId]) return waveformCache[refId];
    const data = await generateWaveform(url, isVideoSource);
    if (data) {
      setWaveformCache(prev => ({ ...prev, [refId]: data }));
    }
    return data;
  };

  const handleAddReference = async (file: File, tabId: string, options?: { bindShot?: boolean }) => {
    // bindShot: 是否绑定到当前镜头（仅制作阶段内上传时使用）
    // 默认不绑定shot（侧边栏创意面板的上传是项目级全局资源）
    const shouldBindShot = options?.bindShot ?? false;
    
    const refType = (tabId === 'image-ref' || tabId === 'asset-lib') ? 'image' 
                  : (tabId === 'video-ref') ? 'video' 
                  : 'audio';
    const thumb = refType === 'video' ? await generateThumbnail(URL.createObjectURL(file)) : undefined;
    const dataUrl = await readFileAsDataUrl(file);
    
    await db.references.add({
      projectId: selectedProject?.id,
      shotId: shouldBindShot ? selectedShot?.id : undefined,
      type: refType,
      category: tabId as Reference['category'],
      url: dataUrl,
      name: file.name,
      thumbnailUrl: thumb || (refType === 'image' ? dataUrl : undefined),
      notes: '',
      createdAt: new Date(),
    });

    // Reload references for the panel
    if (selectedProject?.id) {
      const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
      const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
      setCreativePanelRefs([...projRefs, ...sfxRefs]);
    } else {
      const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
      setCreativePanelRefs(sfxRefs);
    }
  };

  const handleDeleteReference = async (id: number) => {
    await db.references.delete(id);
    if (selectedProject?.id) {
      const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
      const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
      setCreativePanelRefs([...projRefs, ...sfxRefs]);
    } else {
      const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
      setCreativePanelRefs(sfxRefs);
    }
  };

  // --- Shot Creative Stage Handlers ---

  const handleCreativeUpload = async (file: File) => {
    if (!selectedShot?.id || !selectedProject?.id) return;
    const tabId = file.type.startsWith('video/') ? 'video-ref' : 'image-ref';
    
    // 先获取图片尺寸（在写入DB之前），用于后续布局
    let preDims: { w: number; h: number } | null = null;
    if (tabId === 'image-ref') {
      preDims = await new Promise<{ w: number; h: number }>((resolve) => {
        const objUrl = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(objUrl); };
        img.onerror = () => { resolve({ w: 280, h: 200 }); URL.revokeObjectURL(objUrl); };
        img.src = objUrl;
      });
    }
    
    // 写入DB（绑定到当前镜头）
    await handleAddReference(file, tabId, { bindShot: true });
    
    // 重新从DB读取最新列表（确保拿到自增ID）
    const shotRefs = await db.references.where('shotId').equals(selectedShot.id).toArray();
    const newImageRefs = shotRefs.filter(r => r.category === 'image-ref');
    const newVideoRefs = shotRefs.filter(r => r.category === 'video-ref');
    setShotImageRefs(newImageRefs);
    setShotVideoRefs(newVideoRefs);
    
    // 为新图片计算位置并显示
    if (tabId === 'image-ref' && preDims) {
      // 找到最新添加的那条记录（用name+最大id匹配）
      const sortedById = [...newImageRefs].sort((a, b) => (b.id || 0) - (a.id || 0));
      const newRef = sortedById.find(r => r.name === file.name);
      
      if (newRef && newRef.id != null) {
        const maxW = 300;
        const ratio = preDims.w / preDims.h;
        const displayW = Math.min(preDims.w, maxW);
        const displayH = displayW / ratio;
        
        setImgPositions(prev => {
          // 基于当前已有位置数量计算新位置（避免重复）
          const n = Object.keys(prev).length;
          const cols = 3;
          const col = n % cols;
          const row = Math.floor(n / cols);
          const newPos = {
            ...prev,
            [newRef.id]: {
              x: 60 + col * (maxW + 20),
              y: 60 + row * (displayH + 20),
              w: displayW,
              h: Math.round(displayH),
            },
          };
          try { localStorage.setItem(`cineflow_board_${selectedShot!.id}`, JSON.stringify(newPos)); } catch(e) {}
          return newPos;
        });
      }
    }
  };

  // ========== PureRef2-style Board Event Handlers ==========
  
  /** 滚轮缩放（以鼠标位置为中心） - 参考PureRef: 滚轮直接缩放 */
  const handleBoardWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = boardContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.min(5, Math.max(0.1, boardZoom * delta));
    
    // 以鼠标位置为中心缩放
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setBoardPan(prev => ({
      x: mx - (mx - prev.x) * (newZoom / boardZoom),
      y: my - (my - prev.y) * (newZoom / boardZoom),
    }));
    setBoardZoom(newZoom);
  };

  /** 画布鼠标按下 */
  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 左键 + Alt / 中键 = 平移画布
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsBoardPanning(true);
      setBoardPanStart({ x: e.clientX - boardPan.x, y: e.clientY - boardPan.y });
      e.preventDefault();
      return;
    }
    // 左键点击空白 = 取消选择
    if (e.button === 0) {
      setSelectedImgIds(new Set());
    }
  };

  /** 画布鼠标移动 */
  const handleBoardMouseMove = (e: React.MouseEvent) => {
    // 平移中
    if (isBoardPanning) {
      setBoardPan({ x: e.clientX - boardPanStart.x, y: e.clientY - boardPanStart.y });
      return;
    }
    // 拖拽图片中
    if (draggingImgId !== null) {
      const rect = boardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left - boardPan.x) / boardZoom - dragOffset.x;
      const y = (e.clientY - rect.top - boardPan.y) / boardZoom - dragOffset.y;
      setImgPositions(prev => ({
        ...prev,
        [draggingImgId]: { ...prev[draggingImgId]!, x, y },
      }));
      return;
    }
    // 缩放图片中（拖拽右下角）
    if (resizingImgId !== null) {
      const rect = boardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = imgPositions[resizingImgId] || { x: 0, y: 0, w: 260, h: 180 };
      const dx = (e.clientX - resizeStart.x) / boardZoom;
      const newW = Math.max(50, resizeStart.w + dx);
      const ratio = resizeStart.w / resizeStart.h;
      const newH = newW / ratio;
      setImgPositions(prev => ({
        ...prev,
        [resizingImgId]: { ...prev[resizingImgId]!, w: newW, h: Math.round(newH) },
      }));
    }
  };

  /** 画布鼠标抬起 */
  const handleBoardMouseUp = () => {
    if (draggingImgId || resizingImgId) {
      saveBoardPositions();
    }
    setIsBoardPanning(false);
    setDraggingImgId(null);
    setResizingImgId(null);
  };

  /** 图片鼠标按下 — 开始拖拽 + 选择逻辑 */
  const handleImgMouseDown = (e: React.MouseEvent, refId: number) => {
    if (e.button !== 0) return; // 只响应左键
    e.stopPropagation(); // 防止冒泡到画布（取消选择）
    
    const pos = imgPositions[refId] || { x: 60, y: 60, w: 260, h: 180 };

    // 选择逻辑：Ctrl/Shift = 多选，否则单选
    if (e.ctrlKey || e.shiftKey) {
      setSelectedImgIds(prev => {
        const next = new Set(prev);
        if (next.has(refId)) next.delete(refId); else next.add(refId);
        return next;
      });
    } else {
      setSelectedImgIds(new Set([refId]));
    }

    // 开始拖拽
    const rect = boardContainerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: (e.clientX - rect.left - boardPan.x) / boardZoom - pos.x,
        y: (e.clientY - rect.top - boardPan.y) / boardZoom - pos.y,
      });
      setDraggingImgId(refId);
    }
  };

  /** 图片缩放手柄按下 */
  const handleResizeMouseDown = (e: React.MouseEvent, refId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = imgPositions[refId] || { x: 60, y: 60, w: 260, h: 180 };
    setResizingImgId(refId);
    setResizeStart({ x: e.clientX, y: e.clientY, w: pos.w, h: pos.h, ix: pos.x, iy: pos.y });
  };

  /** 保存位置到 localStorage（按shot隔离） */
  const saveBoardPositions = () => {
    if (selectedShot?.id) {
      try {
        localStorage.setItem(`cineflow_board_${selectedShot.id}`, JSON.stringify(imgPositions));
      } catch(e) { /* ignore quota */ }
    }
  };

  /** 粘贴导入图片（Ctrl+V） */
  const handleBoardPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleCreativeUpload(file);
        break;
      }
    }
  };

  // ===== 全局创意面板（Modal）PureRef2 画布事件处理 =====

  /** 加载全局画布图片位置（仅项目级图片，shotId为空） */
  const loadGlobalBoardPositions = async (globalImgRefs: Reference[]) => {
    if (globalImgRefs.length === 0) { setGlobalImgPositions({}); return; }

    // 从 localStorage 恢复位置
    let saved: Record<number, { x: number; y: number; w: number; h: number }> | null = null;
    try { saved = JSON.parse(localStorage.getItem(GLOBAL_BOARD_KEY) || 'null'); } catch(e) {}

    const result: Record<number, { x: number; y: number; w: number; h: number }> = saved || {};
    const needLoadDims: Array<{ ref: Reference }> = [];

    for (const ref of globalImgRefs) {
      if (!ref.id || result[ref.id]) continue;
      needLoadDims.push({ ref });
    }

    for (const item of needLoadDims) {
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 280, h: 200 });
        img.src = item.ref.url || item.ref.thumbnailUrl || '';
      });
      const maxW = 300;
      const ratio = dims.w / dims.h;
      const w = Math.min(dims.w, maxW);
      const h = w / ratio;
      const n = Object.keys(result).length;
      result[item.ref.id!] = {
        x: 60 + (n % 3) * (maxW + 20),
        y: 60 + Math.floor(n / 3) * (h + 20),
        w, h: Math.round(h),
      };
    }

    setGlobalImgPositions(result);
    try { localStorage.setItem(GLOBAL_BOARD_KEY, JSON.stringify(result)); } catch(e) {}
  };

  /** 全局画布：上传/拖放后自动定位新图片（仅匹配项目级图片） */
  const positionGlobalNewImage = async (fileName: string, refs: Reference[]) => {
    // 只在项目级全局图片中查找（shotId为空），不碰镜头级数据
    const sortedById = [...refs]
      .filter(r => r.category === 'image-ref' && !r.shotId)
      .sort((a, b) => (b.id || 0) - (a.id || 0));
    const newRef = sortedById.find(r => r.name === fileName);
    if (!newRef || newRef.id == null) return;
    if (globalImgPositions[newRef.id]) return;

    const preDims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 280, h: 200 });
      img.src = newRef.url || newRef.thumbnailUrl || '';
    });

    const maxW = 300;
    const ratio = preDims.w / preDims.h;
    const displayW = Math.min(preDims.w, maxW);
    const displayH = displayW / ratio;

    setGlobalImgPositions(prev => {
      const n = Object.keys(prev).length;
      const newPos = {
        ...prev,
        [newRef.id]: {
          x: 60 + (n % 3) * (maxW + 20),
          y: 60 + Math.floor(n / 3) * (displayH + 20),
          w: displayW,
          h: Math.round(displayH),
        },
      };
      try { localStorage.setItem(GLOBAL_BOARD_KEY, JSON.stringify(newPos)); } catch(e) {}
      return newPos;
    });
  };

  /** 全局画布：保存所有位置 */
  const saveGlobalBoardPositions = () => {
    try { localStorage.setItem(GLOBAL_BOARD_KEY, JSON.stringify(globalImgPositions)); } catch(e) {}
  };

  /** 全局画布：滚轮缩放 */
  const handleGlobalBoardWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = globalBoardContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.min(5, Math.max(0.1, globalBoardZoom * delta));
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setGlobalBoardPan(prev => ({
      x: mx - (mx - prev.x) * (newZoom / globalBoardZoom),
      y: my - (my - prev.y) * (newZoom / globalBoardZoom),
    }));
    setGlobalBoardZoom(newZoom);
  };

  /** 全局画布：鼠标按下 */
  const handleGlobalBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsGlobalBoardPanning(true);
      setGlobalBoardPanStart({ x: e.clientX - globalBoardPan.x, y: e.clientY - globalBoardPan.y });
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      const rect = globalBoardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left - globalBoardPan.x) / globalBoardZoom;
      const y = (e.clientY - rect.top - globalBoardPan.y) / globalBoardZoom;
      // 开始框选
      setGlobalSelectionBox({ start: { x, y }, end: { x, y } });
      setGlobalSelectedIds(new Set());
    }
  };

  /** 全局画布：鼠标移动 */
  const handleGlobalBoardMouseMove = (e: React.MouseEvent) => {
    if (isGlobalBoardPanning) {
      setGlobalBoardPan({ x: e.clientX - globalBoardPanStart.x, y: e.clientY - globalBoardPanStart.y });
      return;
    }
    if (globalDraggingId !== null) {
      const rect = globalBoardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left - globalBoardPan.x) / globalBoardZoom - globalDragOffset.x;
      const y = (e.clientY - rect.top - globalBoardPan.y) / globalBoardZoom - globalDragOffset.y;
      setGlobalImgPositions(prev => ({
        ...prev,
        [globalDraggingId]: { ...prev[globalDraggingId]!, x, y },
      }));
      return;
    }
    if (globalResizingId !== null) {
      const rect = globalBoardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = globalImgPositions[globalResizingId] || { x: 0, y: 0, w: 260, h: 180 };
      const dx = (e.clientX - globalResizeStart.x) / globalBoardZoom;
      const newW = Math.max(50, globalResizeStart.w + dx);
      const ratio = globalResizeStart.w / globalResizeStart.h;
      const newH = newW / ratio;
      setGlobalImgPositions(prev => ({
        ...prev,
        [globalResizingId]: { ...prev[globalResizingId]!, w: newW, h: Math.round(newH) },
      }));
      return;
    }
    // 更新框选区域
    if (globalSelectionBox.start.x !== null) {
      const rect = globalBoardContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left - globalBoardPan.x) / globalBoardZoom;
      const y = (e.clientY - rect.top - globalBoardPan.y) / globalBoardZoom;
      setGlobalSelectionBox(prev => ({ ...prev, end: { x, y } }));
    }
  };

  /** 全局画布：鼠标抬起 */
  const handleGlobalBoardMouseUp = () => {
    if (globalDraggingId || globalResizingId) saveGlobalBoardPositions();
    setIsGlobalBoardPanning(false);
    setGlobalDraggingId(null);
    setGlobalResizingId(null);
    // 结束框选：选中框内的图片
    if (globalSelectionBox.start.x !== null) {
      const sx = Math.min(globalSelectionBox.start.x, globalSelectionBox.end.x);
      const sy = Math.min(globalSelectionBox.start.y, globalSelectionBox.end.y);
      const ex = Math.max(globalSelectionBox.start.x, globalSelectionBox.end.x);
      const ey = Math.max(globalSelectionBox.start.y, globalSelectionBox.end.y);
      const selected = new Set<number>();
      for (const ref of creativePanelRefs) {
        if (ref.category !== 'image-ref' || ref.shotId) continue;
        const rx = ref.boardX ?? 100;
        const ry = ref.boardY ?? 100;
        const rw = (ref.boardW ?? 250);
        const rh = (ref.boardH ?? 180);
        if (rx < ex && rx + rw > sx && ry < ey && ry + rh > sy && ref.id != null) {
          selected.add(ref.id);
        }
      }
      setGlobalSelectedIds(selected);
      setGlobalSelectionBox({ start: { x: null, y: null }, end: { x: 0, y: 0 } });
    }
  };

  /** 全局画布：图片按下 — 拖拽+选择 */
  const handleGlobalImgMouseDown = (e: React.MouseEvent, refId: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = globalImgPositions[refId] || { x: 60, y: 60, w: 260, h: 180 };

    if (e.ctrlKey || e.shiftKey) {
      setGlobalSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(refId)) next.delete(refId); else next.add(refId);
        return next;
      });
    } else {
      setGlobalSelectedIds(new Set([refId]));
    }

    const rect = globalBoardContainerRef.current?.getBoundingClientRect();
    if (rect) {
      setGlobalDragOffset({
        x: (e.clientX - rect.left - globalBoardPan.x) / globalBoardZoom - pos.x,
        y: (e.clientY - rect.top - globalBoardPan.y) / globalBoardZoom - pos.y,
      });
      setGlobalDraggingId(refId);
    }
  };

  /** 全局画布：缩放手柄 */
  const handleGlobalResizeMouseDown = (e: React.MouseEvent, refId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = globalImgPositions[refId] || { x: 60, y: 60, w: 260, h: 180 };
    setGlobalResizingId(refId);
    setGlobalResizeStart({ x: e.clientX, y: e.clientY, w: pos.w, h: pos.h, ix: pos.x, iy: pos.y });
  };

  /** 全局画布：粘贴导入 */
  const handleGlobalBoardPaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await handleAddReference(file, 'image-ref');
          // 刷新列表
          if (selectedProject?.id) {
            const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
            const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
            const merged = [...projRefs, ...sfxRefs];
            setCreativePanelRefs(merged);
            await positionGlobalNewImage(file.name, merged);
          }
        }
        break;
      }
    }
  };

  /** 全局画布：拖放导入 */
  const handleGlobalBoardDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        await handleAddReference(file, 'image-ref');
        if (selectedProject?.id) {
          const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
          const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
          const merged = [...projRefs, ...sfxRefs];
          setCreativePanelRefs(merged);
          await positionGlobalNewImage(file.name, merged);
        }
      }
    }
  };

  /** 全局画布：删除选中 */
  const handleGlobalDeleteSelected = async () => {
    const idsToDelete = Array.from(globalSelectedIds);
    
    // 从DB删除
    for (const id of idsToDelete) {
      try { await db.references.delete(id); } catch(e) { /* 可能已被删 */ }
    }

    // 刷新列表
    if (selectedProject?.id) {
      const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
      const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
      setCreativePanelRefs([...projRefs, ...sfxRefs]);
    }

    // 从位置中移除并持久化
    setGlobalImgPositions(prev => {
      const next = { ...prev };
      for (const id of idsToDelete) delete next[id];
      // 用最新的next值持久化（不用闭包旧值）
      try { localStorage.setItem(GLOBAL_BOARD_KEY, JSON.stringify(next)); } catch(e) {}
      return next;
    });

    setGlobalSelectedIds(new Set());
  };

  // ===== PureRef .pur 文件兼容 =====

  /** 解析 .pur 文件（PNG 格式，图片数据嵌入在自定义 chunk 中） */
  const parsePurFile = async (file: File): Promise<Array<{ name: string; dataUrl: string; x: number; y: number; w: number; h: number }>> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const buffer = reader.result as ArrayBuffer;
          const view = new DataView(buffer);

          // 检查 PNG 魔数
          const magic = [137, 80, 78, 71, 13, 10, 26, 10];
          for (let i = 0; i < 8; i++) {
            if (view.getUint8(i) !== magic[i]) {
              reject(new Error('不是有效的 .pur 文件（非 PNG 格式）'));
              return;
            }
          }

          // 解析 PNG chunks
          let offset = 8; // 跳过 PNG 签名
          const images: Array<{ name: string; dataUrl: string; x: number; y: number; w: number; h: number }> = [];
          let bgColor: number[] | null = null;

          while (offset < buffer.byteLength - 12) {
            const length = view.getUint32(offset);
            offset += 4;
            const type = String.fromCharCode(
              view.getUint8(offset), view.getUint8(offset + 1),
              view.getUint8(offset + 2), view.getUint8(offset + 3)
            );
            offset += 4;
            const dataStart = offset;
            const data = new Uint8Array(buffer, offset, length);
            offset += length + 4; // skip CRC

            if (type === 'tEXt' || type === 'iTXt') {
              // 尝试读取文本元数据（可能包含位置信息）
              const text = new TextDecoder().decode(data);
              if (text.startsWith('pureRef')) {
                try { const json = JSON.parse(text.substring(7)); if (json.bgColor) bgColor = json.bgColor; } catch {}
              }
            }

            // PureRef 将图片存储在自定义 IDAT-like 或自定义 chunk 中
            // 也检查是否有内嵌的图像数据
          }

          // 如果标准解析没有找到图片，尝试提取所有嵌入的图片数据
          // PureRef 的实际格式更复杂，这里做基本兼容
          // 回退：将整个文件作为单张图加载，让用户手动放置
          if (images.length === 0) {
            const blob = new Blob([buffer], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            images.push({ name: file.name.replace('.pur', ''), dataUrl: url, x: 60, y: 60, w: 300, h: 200 });
          }

          // 应用背景色
          if (bgColor && bgColor.length >= 3) {
            const hex = '#' + bgColor.map(v => v.toString(16).padStart(2, '0')).join('');
            setGlobalBoardBgColor(hex);
          }

          resolve(images);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  };

  /** 导入 .pur 文件到全局画板 */
  const handleImportPur = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const images = await parsePurFile(file);
      
      for (const img of images) {
        // 将图片作为 reference 存入 DB
        const response = await fetch(img.dataUrl);
        const blob = await response.blob();
        const imageFile = new File([blob], img.name || 'imported.png', { type: 'image/png' });
        
        await handleAddReference(imageFile, 'image-ref');
        
        // 刷新 ref 列表并设置位置
        const allRefs = await db.references.where('projectId').equals(selectedProject?.id || 0).toArray();
        const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
        const merged = [...allRefs, ...sfxRefs];
        setCreativePanelRefs(merged);
        
        // 找到刚添加的 ref 并设置位置
        const sortedById = [...merged.filter(r => r.category === 'image-ref' && !r.shotId)]
          .sort((a, b) => (b.id || 0) - (a.id || 0));
        const newRef = sortedById.find(r => r.name === img.name);
        
        if (newRef && newRef.id != null) {
          setGlobalImgPositions(prev => ({
            ...prev,
            [newRef.id]: { x: img.x, y: img.y, w: img.w, h: img.h },
          }));
        }
        
        URL.revokeObjectURL(img.dataUrl);
      }
    } catch (err) {
      console.error('导入 .pur 失败:', err);
      alert('导入 .pur 文件失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
    
    e.target.value = '';
  };

  /** 从全局画板导出为 .pur 兼容格式（JSON 包装） */
  const handleExportPur = async () => {
    const refs = creativePanelRefs.filter(r => r.category === 'image-ref' && r.type === 'image' && !r.shotId);
    if (refs.length === 0) { alert('画布上没有图片可导出'); return; }

    // 收集所有图片和位置信息
    const purData = {
      version: '1.0',
      appName: 'Cineflow',
      bgColor: globalBoardBgColor,
      canvas: globalImgPositions,
      images: await Promise.all(refs.map(async (ref) => {
        try {
          const resp = await fetch(ref.url || ref.thumbnailUrl || '');
          const blob = await resp.blob();
          return {
            id: ref.id,
            name: ref.name,
            pos: globalImgPositions[ref.id!] || { x: 0, y: 0, w: 260, h: 180 },
            data: await blobToBase64(blob),
          };
        } catch { return null; }
      })).then(arr => arr.filter(Boolean)),
    };

    // 生成下载文件（.pur 本质是特殊 PNG，这里用 JSON 格式兼容）
    const jsonStr = JSON.stringify(purData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cineflow_${selectedProject?.name || 'board'}_${Date.now()}.pur`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Blob 转 Base64 辅助函数 */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleVideoContextMenu = (e: React.MouseEvent, ref: Reference) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, refId: ref.id! });
  };

  const handleAddVideoToStringout = async (ref: Reference) => {
    // Convert video reference to a stringout-compatible version
    if (!selectedProject?.id) return;
    setContextMenu(null);
    
    // Open stringout and add the video reference info
    await loadStringoutVersions();
    setIsStringoutModal(true);
  };

  const handleDeleteShotRef = async (refId: number) => {
    await db.references.delete(refId);
    if (selectedShot?.id) {
      const shotRefs = await db.references.where('shotId').equals(selectedShot.id).toArray();
      setShotImageRefs(shotRefs.filter(r => r.category === 'image-ref'));
      setShotVideoRefs(shotRefs.filter(r => r.category === 'video-ref'));
      setImgPositions(prev => {
        const next = { ...prev };
        delete next[refId];
        return next;
      });
    }
  };

  const loadStringoutVersions = async (stageFilter?: string) => {
    if (!selectedProject?.id) return;
    console.log(`[串片] 开始加载版本, stageFilter=${stageFilter || '(全部最新)'}, projectId=${selectedProject.id}`);
    
    const projShots = await db.shots.where('projectId').equals(selectedProject.id).toArray();
    console.log(`[串片] 项目中共 ${projShots.length} 个镜头`);
    
    const allVersions: Version[] = [];
    for (const shot of projShots) {
      let shotVers: Version[];
      
      if (stageFilter) {
        // 用 filter 按阶段筛选（因为索引是独立的，不能用复合索引查询）
        shotVers = await db.versions
          .where('shotId').equals(shot.id!)
          .filter(v => v.stageName === stageFilter)
          .toArray();
        // 按版本号降序排列，取最新
        shotVers.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
      } else {
        // 不筛选：取该镜头所有阶段中版本号最大的那个
        shotVers = await db.versions.where('shotId').equals(shot.id!).sortBy('versionNumber');
      }
      
      if (shotVers.length > 0) {
        const latest = shotVers[0];
        allVersions.push(latest);
        console.log(`[串片] 镜头 "${shot.name}" → ${latest.name} (V${latest.versionNumber}, ${latest.stageName})`);
      } else {
        console.log(`[串片] 镜头 "${shot.name}" → 无可用版本 (filter: ${stageFilter || '全部'})`);
      }
    }

    console.log(`[串片] 共加载 ${allVersions.length} 个版本`);
    setStringoutVersions(allVersions);
    setStringoutOrder(allVersions.map((_, i) => i));
    setStringoutCurrentIdx(0);
    setIsStringoutPlaying(false);
  };

  const generateDaVinciXML = () => {
    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5.0">
  <sequence>
    <name>${selectedProject?.name || 'CineFlow'}_Stringout</name>
    <duration>${stringoutVersions.length * 100}</duration>
    <rate>
      <timebase>24</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <depth>24</depth>
          </samplecharacteristics>
        </format>
        <track>
          <clipitem>`;
    
    const clips = stringoutOrder.map((idx, i) => {
      const ver = stringoutVersions[idx];
      const fps = ver?.metadata?.fps || 24;
      const dur = Math.round((ver?.metadata?.duration || 1) * fps);
      const start = i * 100;
      return `
            <name>${ver?.name || `Clip_${i + 1}`}</name>
            <start>${start}</start>
            <end>${start + dur}</end>
            <in>0</in>
            <out>${dur}</out>
            <file>
              <name>${ver?.name || `Clip_${i + 1}`}</name>
              <url>file://${ver?.videoUrl || ''}</url>
            </file>`;
    }).join('');
    
    const xmlFooter = `
        </clipitem>
        </track>
      </video>
    </media>
  </sequence>
</xmeml>`;

    return xmlHeader + clips + xmlFooter;
  };

  const handleExportDaVinci = () => {
    setIsExportingDaVinci(true);
    try {
      const xml = generateDaVinciXML();
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedProject?.name || 'CineFlow'}_Stringout.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExportingDaVinci(false);
    }
  };

  const handleStringoutReorder = (fromIdx: number, toIdx: number) => {
    const newOrder = [...stringoutOrder];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    setStringoutOrder(newOrder);
  };

  // --- Render Helpers ---

  const filteredShots = useMemo(() => {
    return shots.filter(s => s.name.toLowerCase().includes(shotSearch.toLowerCase()));
  }, [shots, shotSearch]);

  // ===== 智能项目监控分析 — 连接真实数据 =====
  const projectHealth = useMemo(() => {
    if (!selectedProject?.id || shots.length === 0) {
      return { completionRate: 0, totalShots: 0, stageProgress: {}, summary: '', alerts: [], stats: {} };
    }

    // 1. 基于各阶段 Task 状态计算完成率（比单纯用 shot.status 更准确）
    const totalStages = shots.length * DEFAULT_STAGES.length;
    let approvedCount = 0;
    let inProgressCount = 0;
    let reviewCount = 0;
    let pendingCount = 0;

    // 各阶段统计
    const stageProgress: Record<string, { done: number; total: number; rate: number }> = {};
    for (const stage of DEFAULT_STAGES) {
      const stageTasks = allProjectTasks.filter(t => t.name === stage);
      const done = stageTasks.filter(t => t.status === 'approved').length;
      const inProg = stageTasks.filter(t => t.status === 'in-progress').length;
      const rev = stageTasks.filter(t => t.status === 'review').length;
      const pend = stageTasks.filter(t => t.status === 'pending').length;
      
      stageProgress[stage] = {
        done,
        total: shots.length,
        rate: shots.length > 0 ? Math.round((done / shots.length) * 100) : 0,
      };
      approvedCount += done;
      inProgressCount += inProg;
      reviewCount += rev;
      pendingCount += pend;
    }

    // 总完成率 = 所有 task 中 approved 的占比
    const totalTasks = allProjectTasks.length || 1;
    const overallCompletion = Math.round((allProjectTasks.filter(t => t.status === 'approved').length / totalTasks) * 100);

    // 2. 版本统计
    const totalVersions = allShotVersions.length;
    const latestVersionPerShot = new Map<number, Version>();
    for (const ver of allShotVersions) {
      const existing = latestVersionPerShot.get(ver.shotId);
      if (!existing || (ver.versionNumber || 0) > (existing.versionNumber || 0)) {
        latestVersionPerShot.set(ver.shotId, ver);
      }
    }
    const shotsWithVersions = latestVersionPerShot.size;

    // 3. 镜头状态
    const shotStatusCounts = {
      approved: shots.filter(s => s.status === 'approved').length,
      review: shots.filter(s => s.status === 'review').length,
      'in-progress': shots.filter(s => s.status === 'in-progress').length,
      pending: shots.filter(s => !s.status || s.status === 'pending').length,
    };

    // 4. 生成智能摘要和警报
    const alerts: string[] = [];
    
    if (reviewCount > 0) alerts.push(`${reviewCount} 个任务待审核`);
    if (inProgressCount > 5) alerts.push(`${inProgressCount} 个任务进行中，进度良好`);
    if (pendingCount > shots.length * DEFAULT_STAGES.length * 0.6) alerts.push('大部分任务尚未开始');
    if (totalVersions > 0 && shotsWithVersions < shots.length * 0.5) alerts.push(`${shots.length - shotsWithVersions} 个镜头暂无版本文件`);

    // 找出最慢的阶段
    const slowestStage = Object.entries(stageProgress)
      .filter(([s]) => ['Animation', 'Previs', 'Comp', 'FX'].includes(s))
      .sort((a, b) => a[1].rate - b[1].rate)[0];

    let summary = '';
    if (overallCompletion >= 80) {
      summary = `项目整体进展顺利！${alerts.slice(0, 1).join('，')}。`;
    } else if (overallCompletion >= 40) {
      summary = `项目稳步推进中。${slowestStage ? `${STAGE_LABELS[slowestStage[0]] || slowestStage[0]}阶段(${slowestStage[1].rate}%)需要关注` : ''}${alerts.length > 0 ? `；${alerts[0]}` : ''}。`;
    } else if (overallCompletion > 0) {
      summary = `项目处于初期阶段。共 ${shots.length} 个镜头，已提交 ${totalVersions} 个版本文件。建议优先推进 ${slowestStage ? STAGE_LABELS[slowestStage[0]] || slowestStage[0] : ''}。`;
    } else {
      summary = `${shots.length} 个镜头已创建，等待开始制作。上传文件或分配任务以启动工作流。`;
    }

    return {
      completionRate: overallCompletion,
      totalShots: shots.length,
      totalVersions,
      shotsWithVersions,
      stageProgress,
      summary,
      alerts,
      stats: {
        approved: approvedCount,
        inProgress: inProgressCount,
        review: reviewCount,
        pending: pendingCount,
        ...shotStatusCounts,
      },
    };
  }, [selectedProject, shots, allProjectTasks, allShotVersions]);

  const completionRate = projectHealth.completionRate;

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg font-sans">
      {isProjectSelection ? (
        <div className="flex-1 flex items-center justify-center p-8 bg-brand-bg">
          <div className="max-w-4xl w-full space-y-12">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-600/20 mx-auto">
                <Film className="text-white w-10 h-10" />
              </div>
              <h1 className="text-4xl font-black text-white tracking-tighter">CineFlow <span className="text-blue-500">Production</span></h1>
              <p className="text-gray-500 font-medium">选择现有项目或开启一段新的创作旅程</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Create New Project */}
              <button 
                onClick={() => setIsAddingProjectModal(true)}
                onDragOver={e => e.preventDefault()}
                onDrop={handleProjectDrop}
                className="glass-panel rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-6 group hover:border-blue-500/50 transition-all duration-500 hover:scale-[1.02] relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Plus className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white">新建项目</h3>
                  <p className="text-xs text-gray-500 mt-2">创建一个全新的工作空间</p>
                  <p className="text-[10px] text-blue-500/60 mt-4 font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                    拖入视频自动分镜
                  </p>
                </div>
              </button>

              {/* Existing Projects */}
              <div className="glass-panel rounded-[2.5rem] p-8 flex flex-col">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 px-2">最近项目</h3>
                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-2 custom-scrollbar">
                  {projects.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => {
                        setSelectedProject(p);
                        setIsProjectSelection(false);
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-gray-500 group-hover:text-blue-400 transition-colors">
                          <LayoutGrid className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-white">{p.name}</p>
                          <p className="text-[10px] text-gray-500">{format(p.createdAt, 'yyyy-MM-dd')}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-all" />
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 py-12">
                      <p className="text-xs italic">暂无项目，请先新建</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* --- Sidebar --- */}
          <aside className="w-72 bg-sidebar-bg border-r border-white/5 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Film className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight">CineFlow</h1>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">v00.1.0</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-0 py-4 custom-scrollbar">

          {/* Projects Section */}
          <section className="pb-4 mb-4 border-b border-white/5">
            <div className="flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-3 h-3 text-blue-400" />
                <h2 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">项目导航</h2>
              </div>
              <button 
                onClick={() => setIsProjectSelection(true)} 
                className="p-1 hover:bg-white/5 rounded-md text-gray-500 hover:text-white transition-colors"
                title="切换/新建项目"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {projects.map(p => (
                <div key={p.id} className="group/proj relative flex items-center">
                  <button 
                    onClick={() => setSelectedProject(p)}
                    className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-medium min-w-0 ${
                      selectedProject?.id === p.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmProject(p); }}
                    className="shrink-0 p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/proj:opacity-100 transition-all"
                    title="删除项目"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Creative Panel — Gradient Block, no separate title */}
          <section className="pb-4 mb-3">
            <div 
              className="relative overflow-hidden rounded-2xl cursor-pointer transition-all group"
              onMouseEnter={() => {
                if (creativePanelHoverTimer.current) clearTimeout(creativePanelHoverTimer.current);
                setIsCreativePanelOpen(true);
              }}
              onMouseLeave={() => {
                creativePanelHoverTimer.current = setTimeout(() => {
                  if (!creativeActiveTab) setIsCreativePanelOpen(false);
                }, 400);
              }}
              onClick={() => setIsCreativePanelOpen(!isCreativePanelOpen)}
            >
              {/* Gradient Background */}
              <div className={`absolute inset-0 transition-all duration-500 ${
                isCreativePanelOpen || creativeActiveTab
                  ? 'bg-gradient-to-br from-purple-600/20 via-fuchsia-600/15 to-blue-600/20'
                  : 'bg-gradient-to-br from-purple-600/8 via-fuchsia-500/5 to-blue-600/8 group-hover:from-purple-600/12 group-hover:via-fuchsia-500/8 group-hover:to-blue-600/12'
              }`} />
              <div className="absolute inset-0 border border-purple-500/20 rounded-2xl transition-all group-hover:border-purple-500/30" />

              {/* Content */}
              <div className="relative px-4 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                  isCreativePanelOpen || creativeActiveTab
                    ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-white/8 text-gray-400 group-hover:bg-purple-600/20 group-hover:text-purple-300'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-xs font-bold tracking-wide transition-colors ${isCreativePanelOpen || creativeActiveTab ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                    创意面板
                  </p>
                  <p className={`text-[9px] transition-colors ${isCreativePanelOpen || creativeActiveTab ? 'text-purple-300/60' : 'text-gray-600'}`}>
                    参考素材 · 音效库 · 串片 · 达芬奇导出
                  </p>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isCreativePanelOpen ? 'rotate-180 text-purple-400' : ''}`} />
              </div>

              {/* Expanded Sub-Menu */}
              <AnimatePresence>
                {(isCreativePanelOpen || creativeActiveTab) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div 
                      className="relative px-3 pb-3 pt-1 space-y-0.5"
                      onMouseEnter={() => {
                        if (creativePanelHoverTimer.current) clearTimeout(creativePanelHoverTimer.current);
                      }}
                      onMouseLeave={() => {
                        creativePanelHoverTimer.current = setTimeout(() => {
                          if (!creativeActiveTab) setIsCreativePanelOpen(false);
                        }, 400);
                      }}
                    >
                      {[
                        { id: 'image-ref', label: '图片参考', icon: Image, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                        { id: 'video-ref', label: '视频参考', icon: FilmIcon, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                        { id: 'music-ref', label: '音乐参考', icon: Music, color: 'text-pink-400', bg: 'bg-pink-400/10' },
                        { id: 'sfx-lib', label: '音效库', icon: Volume2, color: 'text-orange-400', bg: 'bg-orange-400/10' },
                        { id: 'asset-lib', label: '资产库', icon: FolderOpen, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
                        { id: 'editorial', label: '剪辑串片', icon: Clapperboard, color: 'text-amber-400', bg: 'bg-amber-400/10' },
                      ].map(item => {
                        const refCount = creativePanelRefs.filter(r => r.category === item.id).length;
                        const isActive = creativeActiveTab === item.id;
                        return (
                          <motion.button
                            key={item.id}
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              if (item.id === 'editorial') {
                                // 先弹阶段选择对话框
                                setIsStagePickerOpen(true);
                              } else {
                                setCreativeModalTab(item.id);
                                setIsCreativePanelModal(true);
                              }
                              setCreativeActiveTab(item.id);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group/sub ${
                              isActive 
                                ? 'bg-white/10 border border-white/10 shadow-inner' 
                                : 'hover:bg-white/5 border border-transparent'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isActive ? item.bg : 'bg-white/5 group-hover/sub:bg-white/8'}`}>
                              <item.icon className={`w-3.5 h-3.5 transition-colors ${isActive ? item.color : 'text-gray-500 group-hover/sub:text-gray-400'}`} />
                            </div>
                            <p className={`flex-1 text-left text-[11px] font-bold truncate transition-colors ${
                              isActive ? 'text-white' : 'text-gray-400 group-hover/sub:text-gray-200'
                            }`}>
                              {item.label}
                            </p>
                            {item.id !== 'editorial' && refCount > 0 && (
                              <span className="text-[8px] font-mono font-bold text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">
                                {refCount}
                              </span>
                            )}
                            <ChevronRight className="w-3 h-3 text-gray-700 group-hover/sub:text-gray-400 transition-colors" />
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Shot List Section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-2">
              <FilmIcon className="w-3 h-3 text-emerald-400" />
              <h2 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">镜头列表</h2>
              <span className="text-[9px] font-mono text-gray-600 ml-auto">{shots.length}</span>
            </div>

            {/* Compact search bar above new shot button */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
              <input 
                type="text"
                placeholder="搜索..."
                value={shotSearch}
                onChange={e => setShotSearch(e.target.value)}
                className="w-full bg-white/4 border border-white/5 rounded-xl py-1.5 pl-7 pr-3 text-[11px] focus:outline-none focus:border-blue-500/40 transition-all placeholder:text-gray-700"
              />
            </div>

            {/* Big New Shot Button */}
            <button 
              onClick={async () => {
                const existingShots = await db.shots.where('projectId').equals(selectedProject!.id!).toArray();
                setNewShotName(getNextShotName(existingShots));
                setIsAddingShotModal(true);
              }}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-blue-600/20 transition-all font-bold group"
            >
              <div className="w-5 h-5 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span>新建镜头</span>
            </button>

            <div className="space-y-2">
              {filteredShots.map(s => {
                const isSelected = selectedShot?.id === s.id;
                const isHovered = hoveredShotId === s.id;
                // Find latest version for preview (from allShotVersions across all stages)
                const shotVersions = allShotVersions.filter(v => v.shotId === s.id);
                const latestVer = shotVersions.length > 0
                  ? shotVersions.reduce((a, b) => ((a.versionNumber || 0) >= (b.versionNumber || 0) ? a : b))
                  : null;
                const previewUrl = latestVer?.videoBlob ? URL.createObjectURL(latestVer.videoBlob) : latestVer?.videoUrl;

                // Get current stage task status for this shot
                const stageTask = allProjectTasks.find(t => t.shotId === s.id && t.name === selectedStage);
                const stageStatus = stageTask?.status || 'pending';
                // Get latest version for current stage specifically
                const stageVers = shotVersions.filter(v => v.stageName === selectedStage);
                const stageLatestVerNum = stageVers.length > 0 ? Math.max(...stageVers.map(v => v.versionNumber || 0)) : null;

                const stageStatusLabel: Record<string, { label: string; color: string }> = {
                  'pending': { label: '未开始', color: 'bg-gray-500/15 text-gray-500' },
                  'in-progress': { label: '进行中', color: 'bg-blue-500/15 text-blue-400' },
                  'review': { label: '待审核', color: 'bg-yellow-500/15 text-yellow-400' },
                  'approved': { label: '已完成', color: 'bg-emerald-500/15 text-emerald-400' },
                };
                const stageLabel = stageStatusLabel[stageStatus] || stageStatusLabel['pending'];

                return (
                  <button
                    key={s.id}
                    onMouseEnter={() => setHoveredShotId(s.id || null)}
                    onMouseLeave={() => setHoveredShotId(null)}
                    onClick={() => {
                      setSelectedShot(s);
                      if (isRVPlayerOpen) {
                        setIsRVPlayerOpen(false);
                      }
                    }}
                    className={`w-full flex flex-col p-2 rounded-2xl transition-all group border ${
                      isSelected ? 'bg-white/10 border-white/20 shadow-xl' : 'hover:bg-white/5 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-16 h-10 rounded-lg bg-[#16161e] overflow-hidden flex-shrink-0 relative border border-white/5">
                        {isHovered && previewUrl ? (
                          <video
                            src={previewUrl}
                            autoPlay
                            muted
                            loop
                            className="w-full h-full object-cover"
                          />
                        ) : latestVer?.thumbnailUrl || latestVer?.videoBlob || latestVer?.videoUrl ? (
                          <img
                            src={latestVer?.thumbnailUrl || (latestVer?.videoBlob ? URL.createObjectURL(latestVer.videoBlob) : latestVer?.videoUrl)}
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                        {/* Status dot - hidden during hover preview */}
                        {!isHovered && (
                          <div className={`absolute top-1 left-1 w-1.5 h-1.5 rounded-full ${
                            stageStatus === 'approved' ? 'bg-emerald-500' : stageStatus === 'review' ? 'bg-yellow-400' : stageStatus === 'in-progress' ? 'bg-blue-400' : 'bg-gray-600'
                          }`} />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                            {s.name}
                          </span>
                          <div className="flex items-center gap-1">
                            {stageLatestVerNum !== null && (
                              <span className="text-[9px] font-mono font-bold text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                v{String(stageLatestVerNum).padStart(3, '0')}
                              </span>
                            )}
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded tracking-tighter ${stageLabel.color}`}>
                              {stageLabel.label}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">
                          {s.description || '无描述'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/5 bg-sidebar-bg/50">
          <div className="flex items-center justify-between gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase">
              <Download className="w-3 h-3" /> 导出
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase">
              <Upload className="w-3 h-3" /> 导入
            </button>
          </div>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {isRVPlayerOpen && rvVersion ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 flex bg-black overflow-hidden select-none"
            onMouseDown={handleScrubMouseDown}
            onMouseMove={handleScrubMouseMove}
            onMouseUp={handleScrubMouseUp}
            onMouseLeave={handleScrubMouseUp}
          >
            {/* RV Player Left/Center Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* RV Header */}
              <div className="h-14 bg-zinc-900 border-b border-white/5 flex items-center justify-between px-6 z-10">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsRVPlayerOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">{selectedShot?.name} / {rvVersion.stageName} / v{String(rvVersion.versionNumber || 0).padStart(3, '0')}</h3>
                    <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                      {selectedShot?.name} / {rvVersion.stageName} / {rvVersion.metadata?.resolution} / {rvVersion.metadata?.fps}fps
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsRVPlayerOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* RV Viewport */}
              <div 
                className="flex-1 relative overflow-hidden bg-[#050505] flex items-center justify-center cursor-ew-resize"
              >
                <video 
                  ref={rvVideoRef}
                  src={rvPlayableUrl || null}
                  playsInline
                  crossOrigin="anonymous"
                  className="max-h-full max-w-full object-contain shadow-2xl"
                  style={{
                    filter: `brightness(${rvBrightness}%) contrast(${rvContrast}%) saturate(${rvSaturation}%)`,
                  }}
                  onTimeUpdate={handleRvTimeUpdate}
                  onDurationChange={(e) => setRvDuration(e.currentTarget.duration)}
                />

                {/* RV Overlays */}
                <div className="absolute top-6 left-6 pointer-events-none space-y-1">
                  <p className="text-[10px] font-mono text-blue-500 font-bold uppercase tracking-[0.2em]">CineFlow RV Engine</p>
                  <p className="text-2xl font-black text-white/20 font-mono italic">
                    FRAME {Math.floor(rvCurrentTime * (rvVersion.metadata?.fps || 24))}
                  </p>
                </div>

                {/* RV Controls Overlay */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6 w-full max-w-5xl px-8">
                  {/* Enlarged Timeline Area */}
                  <div className="w-full relative group">
                    {/* Frame Indicator Button (Follows Playhead) */}
                    <div 
                      className="absolute -top-12 -translate-x-1/2 flex flex-col items-center transition-all duration-75 pointer-events-none"
                      style={{ left: `${(rvCurrentTime / rvDuration) * 100}%` }}
                    >
                      <div className="bg-blue-600 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-xl border border-blue-400/30 flex items-center gap-2">
                        <PlayCircle className="w-3 h-3" />
                        {Math.floor(rvCurrentTime * (rvVersion.metadata?.fps || 24))}
                      </div>
                      <div className="w-px h-4 bg-blue-500/50 mt-1" />
                    </div>

                    {/* Progress Bar Container */}
                    <div className="w-full h-4 bg-white/5 rounded-full relative cursor-pointer overflow-hidden border border-white/5 hover:border-white/10 transition-all">
                      {/* A-B Loop Range Highlight */}
                      {rvABPoints.a !== null && rvABPoints.b !== null && (
                        <div 
                          className="absolute inset-y-0 bg-yellow-500/20 border-x border-yellow-500/50 z-0"
                          style={{ 
                            left: `${(Math.min(rvABPoints.a, rvABPoints.b) / rvDuration) * 100}%`,
                            width: `${(Math.abs(rvABPoints.b - rvABPoints.a) / rvDuration) * 100}%`
                          }}
                        />
                      )}

                      <div 
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-400 transition-all z-10"
                        style={{ width: `${(rvCurrentTime / rvDuration) * 100}%` }}
                      />
                      <input 
                        type="range"
                        min="0"
                        max={rvDuration || 0}
                        step="0.001"
                        value={rvCurrentTime}
                        onChange={(e) => {
                          if (rvVideoRef.current) rvVideoRef.current.currentTime = parseFloat(e.target.value);
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      />
                    </div>
                  </div>

                  {/* Control Bar */}
                  <div className="glass-panel rounded-2xl p-3 flex items-center gap-6 border border-white/10 shadow-2xl backdrop-blur-2xl">
                    <div className="flex items-center gap-1">
                      <button onClick={() => stepFrame(-10)} className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all"><SkipBack className="w-4 h-4" /></button>
                      <button onClick={() => stepFrame(-1)} className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all"><ChevronLeft className="w-5 h-5" /></button>
                      <button 
                        onClick={() => setRvIsPlaying(!rvIsPlaying)}
                        className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/30"
                      >
                        {rvIsPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
                      </button>
                      <button onClick={() => stepFrame(1)} className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all"><ChevronRight className="w-5 h-5" /></button>
                      <button onClick={() => stepFrame(10)} className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all"><SkipForward className="w-4 h-4" /></button>
                    </div>

                    <div className="h-10 w-px bg-white/10 mx-2" />

                    {/* Speed Control */}
                    <div className="flex flex-col items-center gap-1 group relative">
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/50 transition-all cursor-pointer">
                        <FastForward className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-mono font-bold text-white">{rvPlaybackRate}x</span>
                      </div>
                      <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto">
                        <div className="bg-zinc-900 border border-white/10 rounded-xl p-1 flex flex-col gap-1 shadow-2xl">
                          {[0.3, 0.7, 1.0, 1.2, 1.5, 2.0].map(rate => (
                            <button 
                              key={rate}
                              onClick={() => setRvPlaybackRate(rate)}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all ${
                                rvPlaybackRate === rate ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              {rate.toFixed(1)}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* A-B Loop Controls */}
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setRvABPoints(prev => ({ ...prev, a: rvCurrentTime }))}
                        className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                          rvABPoints.a !== null ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        SET A
                      </button>
                      <button 
                        onClick={() => setRvABPoints(prev => ({ ...prev, b: rvCurrentTime }))}
                        className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                          rvABPoints.b !== null ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        SET B
                      </button>
                      <button 
                        onClick={() => setIsABLooping(!isABLooping)}
                        disabled={rvABPoints.a === null || rvABPoints.b === null}
                        className={`p-2 rounded-xl transition-all ${
                          isABLooping ? 'bg-yellow-500 text-black' : 'bg-white/5 text-gray-400 hover:text-white'
                        } disabled:opacity-20`}
                      >
                        <Repeat className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Global Loop */}
                    <button 
                      onClick={() => setRvIsLooping(!rvIsLooping)}
                      className={`p-3 rounded-xl transition-all ${
                        rvIsLooping ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                      }`}
                      title="循环播放"
                    >
                      <RefreshCw className={`w-4 h-4 ${rvIsLooping ? 'animate-spin-slow' : ''}`} />
                    </button>

                    <div className="h-10 w-px bg-white/10 mx-2" />

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 group">
                        <Sun className="w-4 h-4 text-gray-500 group-hover:text-yellow-500 transition-colors" />
                        <input 
                          type="range" min="50" max="200" value={rvBrightness} 
                          onChange={(e) => setRvBrightness(parseInt(e.target.value))}
                          className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                    </div>

                    <div className="h-10 w-px bg-white/10 mx-2" />

                    <div className="flex items-center gap-4 px-4">
                      <div className="text-right">
                        <p className="text-[10px] font-mono text-gray-500 uppercase">Timecode</p>
                        <p className="text-sm font-mono text-white font-bold">
                          {Math.floor(rvCurrentTime / 60).toString().padStart(2, '0')}:
                          {Math.floor(rvCurrentTime % 60).toString().padStart(2, '0')}:
                          {Math.floor((rvCurrentTime % 1) * (rvVersion.metadata?.fps || 24)).toString().padStart(2, '0')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RV Right Sidebar - Version History */}
            <aside className="w-72 bg-zinc-900 border-l border-white/5 flex flex-col z-20">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <History className="w-4 h-4 text-blue-500" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-widest">历史版本</h3>
                </div>
                <span className="text-[10px] font-mono text-gray-500">{versions.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {versions.map(v => (
                  <div
                    key={v.id}
                    className={`group relative rounded-2xl transition-all border ${
                      rvVersion.id === v.id
                        ? 'bg-blue-600/10 border-blue-500/30 ring-1 ring-blue-500/20'
                        : 'bg-white/2 border-transparent hover:border-white/10'
                    }`}
                  >
                    <button
                      onClick={() => openRVPlayer(v)}
                      className="w-full text-left p-3 rounded-2xl"
                    >
                      <div className="flex gap-3">
                        <div className="w-20 aspect-video rounded-lg bg-black overflow-hidden flex-shrink-0">
                          <img src={v.thumbnailUrl || null} className="w-full h-full object-cover opacity-60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${rvVersion.id === v.id ? 'text-blue-400' : 'text-white'}`}>
                            V{v.versionNumber.toString().padStart(3, '0')}
                          </p>
                          <p className="text-[9px] text-gray-500 mt-1 truncate">{v.name}</p>
                          <p className="text-[8px] font-mono text-gray-600 mt-1">{format(v.createdAt, 'MM-dd HH:mm')}</p>
                        </div>
                      </div>
                    </button>
                    {/* 版本对比按钮 - 悬停时显示在右侧 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openCompare(v); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg text-purple-400 hover:text-purple-300 transition-all opacity-0 group-hover:opacity-100"
                      title="版本对比"
                    >
                      <GitCompare className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-white/5 bg-black/20">
                <div className="flex items-center gap-3 text-gray-500">
                  <Info className="w-4 h-4" />
                  <p className="text-[10px] leading-relaxed">
                    点击版本可快速切换预览。当前查看的是 {selectedStage} 阶段的版本。
                  </p>
                </div>
              </div>
            </aside>
          </motion.div>
        ) : (
          <>
            {/* Header */}
            <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-brand-bg/50 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsProjectSelection(true)}
              className="p-2 hover:bg-white/5 rounded-full text-gray-400"
              title="返回项目选择"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">{selectedProject?.name || 'Select Project'}</h2>
              <p className="text-xs text-gray-500 font-medium">项目看板 — {shots.length} 个镜头</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-2.5 hover:bg-white/5 rounded-xl text-gray-400 transition-all">
              <Settings className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-0.5">
              <div className="w-full h-full rounded-full bg-brand-bg flex items-center justify-center text-xs font-bold text-white">
                FX
              </div>
            </div>
          </div>
        </header>

        {/* ===== 固定的顶部仪表盘区域：智能项目监控 + 我的刀盾 ===== */}
        <div className="flex-shrink-0 h-[260px] p-5 pb-0 space-x-5 flex">
          {/* Health Analysis Card — AI项目健康分析（Recharts甜甜圈图） */}
          <div className="w-[58%] glass-panel rounded-[2rem] p-6 flex items-center relative overflow-hidden">
            {/* 背景装饰 */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-3xl rounded-full -mr-32 -mt-32 transition-all group-hover:bg-blue-600/10" />

            {/* 左侧：Recharts 甜甜圈环形图 */}
            {(() => {
              // 直接从 allProjectTasks 统计（与 projectHealth 同源）
              const tasks = allProjectTasks;
              const approved = tasks.filter(t => t.status === 'approved').length;
              const review = tasks.filter(t => t.status === 'review').length;
              const inProgress = tasks.filter(t => t.status === 'in-progress').length;
              const pending = tasks.filter(t => t.status === 'pending').length;

              return (
              <div className="w-56 h-56 md:w-56 md:h-56 flex-shrink-0 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: '已完成', value: approved },
                        { name: '待审核', value: review },
                        { name: '进行中', value: inProgress },
                        { name: '待开始', value: pending || (tasks.length > 0 ? 0 : 1) },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                          stroke="#ffffff"
                          strokeWidth={2}
                          startAngle={90}
                      endAngle={-270}
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#3b82f6" />
                      <Cell fill="#374151" />
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#141418', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '11px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* 中心完成度文字覆盖 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-3xl font-black text-white tabular-nums leading-none">
                      {projectHealth.completionRate}%
                    </div>
                    <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">完成</div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* 右侧：信息区域 */}
            <div className="relative z-10 pl-8 flex-1 space-y-4">
              {/* 标题 */}
              <div className="flex items-center gap-2 text-purple-400 mb-1">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">AI 项目健康分析</span>
              </div>

              {/* 完成率大字 */}
              <h3 className="text-2xl font-bold text-white tracking-tight leading-tight">
                {projectHealth.completionRate}% 制作完成
              </h3>

              {/* 关注提醒 */}
              <p className="text-sm text-gray-400 leading-relaxed max-w-md">
                需要关注：检测到 <span className="font-medium">{projectHealth.alerts.length}</span> 个截止日期相关提醒，
                <span className="font-medium"> 0</span> 个停滞任务。
              </p>

              {/* 状态标签 — 紧凑排列，直接从 allProjectTasks 统计 */}
              {(() => {
                const tasks = allProjectTasks;
                const approved = tasks.filter(t => t.status === 'approved').length;
                const review = tasks.filter(t => t.status === 'review').length;
                const inProgress = tasks.filter(t => t.status === 'in-progress').length;
                const pending = tasks.filter(t => t.status === 'pending').length;

                return (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <div className="px-3 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.06] flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
                      <span className="text-[10px] font-bold text-gray-300">{approved} 已完成</span>
                    </div>
                    <div className="px-3 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.06] flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-sm shadow-yellow-400/50" />
                      <span className="text-[10px] font-bold text-gray-300">{review} 待审核</span>
                    </div>
                    <div className="px-3 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.06] flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50" />
                      <span className="text-[10px] font-bold text-gray-300">{inProgress} 进行中</span>
                    </div>
                    {pending > 0 && (
                      <div className="px-3 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.06] flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-gray-500 shadow-sm shadow-gray-500/50" />
                        <span className="text-[10px] font-bold text-gray-300">{pending} 待开始</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 我的刀盾 Panel — 固定大小，对话区滚轮翻页 */}
          <div
            className="w-[calc(42%-20px)] glass-panel rounded-[2rem] flex flex-col overflow-hidden relative"
            style={{ maxHeight: '100%' }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
            onDrop={handleSmartDrop}
          >
              {/* Drag overlay */}
              {isDragOver && (
                <div className="absolute inset-0 z-40 bg-purple-600/10 backdrop-blur-md rounded-[2rem] flex items-center justify-center border-2 border-dashed border-purple-400/50 pointer-events-none">
                  <div className="text-center space-y-2">
                    <div className="w-10 h-10 mx-auto bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-purple-400" />
                    </div>
                    <p className="text-[11px] font-bold text-purple-300">释放以智能识别</p>
                  </div>
                </div>
              )}

              {/* 顶部输入栏 — 图标 + 输入框一体化 */}
              <div className="px-4 pt-3 pb-2 flex items-center gap-3 flex-shrink-0">
                <img src="/daodun-logo.png" alt="刀盾" className="w-7 h-7 rounded-lg object-cover flex-shrink-0 shadow-md shadow-purple-600/20" />
                <div className="flex-1 relative bg-white/[0.04] rounded-xl border border-white/[0.06] focus-within:border-purple-500/30 transition-all min-w-0 flex items-center">
                  <input
                    type="text"
                    placeholder="向我的刀盾提问..."
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAiChat()}
                    className="w-full bg-transparent py-1.5 pl-3 pr-9 text-[11px] focus:outline-none placeholder:text-gray-600"
                  />
                  <button
                    onClick={handleAiChat}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white rounded-lg hover:from-purple-400 hover:to-fuchsia-400 transition-all shadow-lg shadow-purple-600/20"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={handleSmartImportClick} className="p-1.5 hover:bg-white/8 rounded-lg text-gray-500 hover:text-purple-400 transition-colors" title="智能导入">
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 hover:bg-white/8 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 对话区 — 卡片内滚动 */}
              <div className="flex-1 px-4 pb-3 overflow-y-auto custom-scrollbar space-y-2.5 overscroll-contain"
                style={{ overscrollBehaviorY: 'contain', minHeight: 0 }}
              >
                {aiChat.length === 0 ? (
                  /* 空状态 — 简洁欢迎 */
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-6">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-400">拖拽文件到此处，或输入指令开始对话</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full max-w-[240px]">
                      <button
                        onClick={handleSmartImportClick}
                        className="flex flex-col items-center gap-2 p-3.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl border border-white/[0.05] hover:border-white/10 transition-all group"
                      >
                        <FilmIcon className="w-6 h-6 text-emerald-500/70 group-hover:text-emerald-400 transition-colors" />
                        <span className="text-[9px] font-medium text-gray-400 group-hover:text-gray-300">智能导入</span>
                      </button>
                      <button
                        onClick={() => setAiInput('分析当前项目进度')}
                        className="flex flex-col items-center gap-2 p-3.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl border border-white/[0.05] hover:border-white/10 transition-all group"
                      >
                        <Activity className="w-6 h-6 text-amber-500/70 group-hover:text-amber-400 transition-colors" />
                        <span className="text-[9px] font-medium text-gray-400 group-hover:text-gray-300">项目分析</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 聊天气泡 */
                  aiChat.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] px-3.5 py-2 rounded-2xl text-[11px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-sm'
                          : 'bg-white/[0.04] text-gray-300 border border-white/[0.04] rounded-bl-sm'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                {isAiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/[0.04] px-3.5 py-2.5 rounded-2xl rounded-bl-sm border border-white/[0.04] flex gap-1.5">
                      <div className="w-1.5 h-1.5 bg-purple-500/60 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-purple-500/60 rounded-full animate-bounce [animation-delay:0.15s]" />
                      <div className="w-1.5 h-1.5 bg-purple-500/60 rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
          {/* ===== 固定仪表盘区域结束 ===== */}

        {/* Scrollable Area — 下方内容独立滚动 */}
        <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar space-y-8">

            {/* Smart Recognition Dialog */}
            <AnimatePresence>
              {showSmartDialog && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                  onClick={() => !isSmartProcessing && setShowSmartDialog(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-[#13131a] border border-white/10 rounded-2xl shadow-2xl w-[580px] max-h-[85vh] overflow-hidden flex flex-col"
                    onClick={e => e.stopPropagation()}
                  >
                  {/* 预生成文件缩略图 URL（仅在对话框打开时） */}
                  {showSmartDialog && (
                    <SmartFileThumbnails files={smartFiles} />
                  )}
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-600/20 rounded-lg flex items-center justify-center">
                          {zipExtractedFiles.length > 0 ? (
                            <FolderOpen className="w-4 h-4 text-orange-400" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">
                            {zipExtractedFiles.length > 0 ? '📦 压缩包解压预览' : '智能识别导入'}
                          </h3>
                          <p className="text-[10px] text-gray-500">
                            {isZipExtracting
                              ? '⏳ 解压中...'
                              : zipExtractedFiles.length > 0
                                ? `${zipExtractedFiles.length} 个文件 — 拖拽到下方阶段区域`
                                : `${smartFiles.length} 个文件等待处理`
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {zipExtractedFiles.length > 0 && !isZipExtracting && (
                          <button
                            onClick={handleAutoAssign}
                            disabled={isSmartProcessing}
                            className="px-3 py-1.5 text-[10px] font-bold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-all"
                          >
                            ✨ 智能识别分配
                          </button>
                        )}
                        {!isSmartProcessing && (
                          <button onClick={() => { setShowSmartDialog(false); setZipExtractedFiles([]); }} className="p-1.5 hover:bg-white/10 rounded-md text-gray-400">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* === 内容区 === */}
                    {isZipExtracting ? (
                      /* 解压加载状态 */
                      <div className="flex-1 flex items-center justify-center min-h-0">
                        <div className="text-center space-y-4">
                          <div className="w-14 h-14 mx-auto bg-orange-500/10 rounded-2xl flex items-center justify-center animate-pulse">
                            <FolderOpen className="w-7 h-7 text-orange-400" />
                          </div>
                          <p className="text-sm font-bold text-white">正在解压压缩包...</p>
                          <p className="text-[10px] text-gray-500">提取文件并生成预览缩略图</p>
                          <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden mx-auto">
                            <div className="h-full bg-orange-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                          </div>
                        </div>
                      </div>
                    ) : zipExtractedFiles.length > 0 ? (
                      /* ===== 压缩包展开模式：文件网格 + 阶段拖放区 ===== */
                      <>
                        {/* 文件网格 - 可拖拽 */}
                        <div className="px-5 py-4 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                              📂 文件列表 ({zipExtractedFiles.filter(f => !f.assignedStage).length} 未分配)
                            </p>
                            <p className="text-[9px] text-gray-600">↑ 拖拽文件到下方阶段</p>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {zipExtractedFiles.map((file, i) => {
                              const isDragged = draggedFileIndex === i;
                              const isAssigned = !!file.assignedStage;
                              return (
                                <div
                                  key={i}
                                  draggable={!isAssigned}
                                  onDragStart={e => {
                                    if (isAssigned) return;
                                    setDraggedFileIndex(i);
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', String(i));
                                  }}
                                  onDragEnd={() => setDraggedFileIndex(null)}
                                  className={`group relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                                    isDragged
                                      ? 'opacity-50 scale-95 ring-2 ring-purple-500'
                                      : isAssigned
                                        ? 'opacity-40 ring-1 ring-green-500/30'
                                        : 'bg-white/[0.03] hover:bg-white/[0.06] hover:ring-1 hover:ring-white/10'
                                  }`}
                                >
                                  {/* 缩略图 */}
                                  <div className="aspect-square bg-[#1a1a24] relative overflow-hidden">
                                    {file.thumbUrl ? (
                                      file.type === 'video' ? (
                                        <video src={file.thumbUrl} className="w-full h-full object-cover" muted preload="metadata" />
                                      ) : (
                                        <img src={file.thumbUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                                      )
                                    ) : (
                                      <div className={`w-full h-full flex items-center justify-center ${
                                        file.type === 'audio' ? 'bg-yellow-500/10 text-yellow-500' :
                                        file.type === 'video' ? 'bg-blue-500/10 text-blue-500' :
                                        'bg-gray-500/10 text-gray-500'
                                      }`}>
                                        {file.type === 'audio' ? <Volume2 className="w-6 h-6" /> :
                                         file.type === 'video' ? <FileVideo className="w-6 h-6" /> :
                                         <FileText className="w-6 h-6" />}
                                      </div>
                                    )}
                                    {/* 已分配标记 */}
                                    {isAssigned && (
                                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                                      </div>
                                    )}
                                    {/* 拖拽提示遮罩 */}
                                    {!isAssigned && (
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-end justify-center pb-2">
                                        <span className="text-[9px] font-bold text-white/80 px-2 py-0.5 bg-black/40 rounded-md">
                                          拖拽到阶段 ↓
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {/* 文件名 */}
                                  <div className="p-1.5">
                                    <p className="text-[9px] font-medium text-white truncate leading-tight" title={file.name}>
                                      {file.name}
                                    </p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className={`text-[8px] font-bold px-1 py-px rounded ${
                                        file.type === 'video' ? 'bg-blue-500/10 text-blue-400' :
                                        file.type === 'image' ? 'bg-green-500/10 text-green-400' :
                                        file.type === 'audio' ? 'bg-yellow-500/10 text-yellow-400' :
                                        'bg-gray-500/10 text-gray-400'
                                      }`}>
                                        {file.type === 'video' ? '视频' : file.type === 'image' ? '图片' : file.type === 'audio' ? '音频' : '其他'}
                                      </span>
                                      {file.assignedStage && (
                                        <span className="text-[8px] text-green-400 truncate">
                                          → {STAGE_LABELS[file.assignedStage]}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 目标镜头选择 */}
                        <div className="px-5 py-3 border-t border-white/5 flex-shrink-0">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">目标镜头</p>
                          </div>
                          <div className="grid grid-cols-5 gap-1.5 max-h-[60px] overflow-y-auto custom-scrollbar">
                            {shots.map(s => (
                              <button
                                key={s.id}
                                onClick={() => setSmartTargetShot(s)}
                                className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-left truncate transition-all ${
                                  smartTargetShot?.id === s.id
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 6个制作阶段 Drop Zone */}
                        <div className="px-5 py-3 border-t border-white/5 flex-shrink-0">
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                            拖拽文件到此处的制作阶段
                          </p>
                          <div className="grid grid-cols-6 gap-1.5">
                            {DEFAULT_STAGES.map(stage => {
                              const Icon = STAGE_ICONS[stage] || Layers;
                              const filesInStage = zipExtractedFiles.filter(f => f.assignedStage === stage).length;
                              const isHovered = hoveredDropStage === stage;
                              const canDrop = draggedFileIndex !== null && smartTargetShot?.id;

                              return (
                                <div
                                  key={stage}
                                  onDragOver={(e) => {
                                    if (!canDrop) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setHoveredDropStage(stage);
                                  }}
                                  onDragLeave={() => setHoveredDropStage(null)}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDropToStage(stage);
                                    setHoveredDropStage(null);
                                  }}
                                  className={`rounded-xl p-2 text-center transition-all cursor-default border ${
                                    isHovered && canDrop
                                      ? 'border-purple-500 bg-purple-500/15 scale-105 shadow-lg shadow-purple-500/20'
                                      : filesInStage > 0
                                        ? 'border-green-500/30 bg-green-500/5'
                                        : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                                  }`}
                                >
                                  <Icon className={`w-4 h-4 mx-auto mb-1 ${
                                    isHovered && canDrop ? 'text-purple-400' : filesInStage > 0 ? 'text-green-400' : 'text-gray-500'
                                  }`} />
                                  <p className={`text-[9px] font-bold leading-tight ${
                                    isHovered && canDrop ? 'text-purple-300' : filesInStage > 0 ? 'text-green-300' : 'text-gray-400'
                                  }`}>
                                    {STAGE_LABELS[stage]}
                                  </p>
                                  {filesInStage > 0 && (
                                    <span className="inline-block mt-0.5 text-[8px] font-bold text-green-400 bg-green-500/10 px-1.5 py-px rounded-full">
                                      {filesInStage}
                                    </span>
                                  )}
                                  {isHovered && canDrop && (
                                    <p className="text-[8px] text-purple-400 mt-0.5">释放导入</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between bg-white/[0.02] flex-shrink-0">
                          <p className="text-[9px] text-gray-500">
                            {smartTargetShot?.name || '未选择镜头'} · 已分配 {zipExtractedFiles.filter(f => f.assignedStage).length}/{zipExtractedFiles.length}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setShowSmartDialog(false); setZipExtractedFiles([]); }}
                              disabled={isSmartProcessing}
                              className="px-4 py-2 text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-50"
                            >
                              取消
                            </button>
                            <button
                              onClick={processAllAssigned}
                              disabled={isSmartProcessing || !smartTargetShot || zipExtractedFiles.filter(f => f.assignedStage).length === 0}
                              className="px-4 py-2 text-[10px] font-bold text-white bg-orange-600 hover:bg-orange-500 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                              {isSmartProcessing ? (
                                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 导入中...</>
                              ) : (
                                <>📦 批量导入已分配 ({zipExtractedFiles.filter(f => f.assignedStage).length})</>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* ===== 标准模式：非压缩包的普通文件 ===== */
                      <>
                        <div className="px-6 py-4 space-y-2 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                          {smartFiles.map((file, i) => {
                            const info = classifyByExt(file.name);
                            const ext = file.name.split('.').pop()?.toLowerCase() || '';
                            const isImageOrVideo = ['image', 'video'].includes(info.type);
                            const thumbUrl = isImageOrVideo ? URL.createObjectURL(file) : null;
                            return (
                              <div key={i} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-xl">
                                {thumbUrl ? (
                                  <div className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden bg-white/5">
                                    {info.type === 'video' ? (
                                      <video src={thumbUrl} className="w-full h-full object-cover" muted preload="metadata" />
                                    ) : (
                                      <img src={thumbUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                                    )}
                                  </div>
                                ) : (
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    info.type === 'audio' ? 'bg-yellow-500/15 text-yellow-400' :
                                    'bg-purple-500/15 text-purple-400'
                                  }`}>
                                    {info.type === 'audio' ? <Volume2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold text-white truncate">{file.name}</p>
                                  <p className="text-[9px] text-gray-500">{(file.size / 1024 / 1024).toFixed(1)}MB · {info.label}</p>
                                </div>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                  info.type === 'video' ? 'bg-blue-500/10 text-blue-400' :
                                  info.type === 'image' ? 'bg-green-500/10 text-green-400' :
                                  info.type === 'audio' ? 'bg-yellow-500/10 text-yellow-400' :
                                  'bg-purple-500/10 text-purple-400'
                                }`}>
                                  {info.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Target selection */}
                        <div className="px-6 py-4 border-t border-white/5 space-y-4 flex-shrink-0">
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">目标镜头</p>
                            <div className="grid grid-cols-4 gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar">
                              {shots.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => setSmartTargetShot(s)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-left truncate transition-all ${
                                    smartTargetShot?.id === s.id
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                  }`}
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">导入阶段</p>
                            <div className="grid grid-cols-4 gap-1.5">
                              {DEFAULT_STAGES.map(stage => (
                                <button
                                  key={stage}
                                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-left truncate transition-all bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                                >
                                  {stage}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.02] flex-shrink-0">
                          <p className="text-[9px] text-gray-600">
                            {smartTargetShot?.name || '未选择'} → 选择目标后导入
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setShowSmartDialog(false); setZipExtractedFiles([]); }}
                              disabled={isSmartProcessing}
                              className="px-4 py-2 text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-50"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => {
                                // 非压缩包直接按默认逻辑导入
                                if (!smartTargetShot?.id) return;
                                processAllAssigned();
                              }}
                              disabled={isSmartProcessing || !smartTargetShot}
                              className="px-4 py-2 text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                              {isSmartProcessing ? (
                                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 导入中...</>
                              ) : (
                                <>开始导入</>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          {/* Bottom Production Section */}
          <div className="grid grid-cols-12 gap-8">
            {/* Production Stages (Left) */}
            <div className="col-span-3 space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">制作阶段 (Stages)</h3>
                <span className="text-[10px] font-mono text-gray-600">
                  {DEFAULT_STAGES.filter(s => {
                    const stageVers = allShotVersions.filter(v => v.stageName === s);
                    return stageVers.length > 0;
                  }).length}/{DEFAULT_STAGES.length} 有文件
                </span>
              </div>
              <div className="space-y-2">
                {DEFAULT_STAGES.map(stage => {
                  const Icon = STAGE_ICONS[stage] || Layers;
                  const isActive = selectedStage === stage;
                  const isCreative = stage === 'Creative';
                  const task = tasks.find(t => t.name === stage);
                  const status = task?.status || 'pending';
                  
                  // Compute version info for this stage — 动态跟随当前镜头
                  const stageVers = allShotVersions.filter(v => v.stageName === stage);
                  // 当前镜头在该阶段的版本
                  const currentShotVers = selectedShot ? stageVers.filter(v => v.shotId === selectedShot.id) : [];
                  const currentShotLatestVer = currentShotVers.length > 0
                    ? Math.max(...currentShotVers.map(v => v.versionNumber || 0))
                    : null;
                  // 全局该阶段最高版本号
                  const globalLatestVerNum = stageVers.length > 0 ? Math.max(...stageVers.map(v => v.versionNumber || 0)) : null;
                  // 显示优先级：当前镜头版本 > 全局最高版本
                  const displayVerNum = currentShotLatestVer ?? globalLatestVerNum;
                  const verCount = stageVers.length;

                  const allStatuses = [
                    { key: 'pending' as const, label: '未开始', color: 'text-gray-400', bg: 'bg-gray-500/15', dot: 'bg-gray-400', hoverColor: 'hover:text-gray-400', hoverBg: 'hover:bg-gray-500/15' },
                    { key: 'in-progress' as const, label: '进行中', color: 'text-blue-400', bg: 'bg-blue-500/15', dot: 'bg-blue-400', hoverColor: 'hover:text-blue-400', hoverBg: 'hover:bg-blue-500/15' },
                    { key: 'review' as const, label: '待审核', color: 'text-yellow-400', bg: 'bg-yellow-500/15', dot: 'bg-yellow-400', hoverColor: 'hover:text-yellow-400', hoverBg: 'hover:bg-yellow-500/15' },
                    { key: 'approved' as const, label: '已完成', color: 'text-emerald-400', bg: 'bg-emerald-500/15', dot: 'bg-emerald-400', hoverColor: 'hover:text-emerald-400', hoverBg: 'hover:bg-emerald-500/15' },
                  ];
                  const currentStatusConfig = allStatuses.find(s => s.key === status) || allStatuses[0];
                  const isStatusHovered = hoveredStage === stage;

                  return (
                    <div key={stage} className="relative">
                      <button
                        onClick={() => setSelectedStage(stage)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                          isCreative && isActive
                            ? 'bg-gradient-to-r from-purple-600/20 via-fuchsia-600/15 to-blue-600/20 border-purple-500/30 shadow-lg shadow-purple-600/10'
                            : isActive
                              ? 'active-gradient'
                              : isCreative
                                ? 'bg-purple-500/5 border-purple-500/10 hover:border-purple-500/25 hover:bg-purple-500/10'
                                : 'bg-white/5 border-transparent hover:border-white/10'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isCreative && isActive
                            ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-lg shadow-purple-600/30'
                            : isActive
                              ? 'bg-blue-600 text-white'
                              : isCreative
                                ? 'bg-purple-500/15 text-purple-400'
                                : 'bg-white/5 text-gray-500'
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-bold truncate ${isCreative && isActive ? 'text-white' : isActive ? 'text-white' : isCreative ? 'text-purple-300' : 'text-gray-400'}`}>{stage}</p>
                            <div className="flex items-center gap-1.5">
                              {displayVerNum !== null && (
                                <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${isActive ? 'bg-white/15 text-white/90' : 'bg-blue-500/10 text-blue-400/80'}`}>
                                  <span>v{String(displayVerNum).padStart(3, '0')}</span>
                                  {verCount > 1 && <span className="text-[7px] font-normal opacity-60">×{verCount}</span>}
                                </span>
                              )}
                              {/* Status button - hover this to show popover */}
                              {!isCreative && (
                                <span
                                  className={`cursor-pointer text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter hover:ring-1 hover:ring-white/20 transition-all ${currentStatusConfig.bg} ${currentStatusConfig.color}`}
                                  onMouseEnter={() => setHoveredStage(stage)}
                                  onMouseLeave={() => setHoveredStage(null)}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {currentStatusConfig.label}
                                </span>
                              )}
                              {isCreative && (
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${currentStatusConfig.bg} ${currentStatusConfig.color}`}>
                                  {currentStatusConfig.label}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className={`text-[10px] truncate ${isCreative && isActive ? 'text-purple-300/60' : 'text-gray-600'}`}>
                            {STAGE_LABELS[stage]}{isCreative ? ' · 参考素材 & 视频管理' : ''}{!isCreative && verCount > 0 ? ` · ${verCount}个版本` : ''}
                          </p>
                        </div>
                        {isCreative && (
                          <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-purple-600'}`} />
                        )}
                      </button>

                      {/* Status Popover - only when hovering the status button */}
                      {isStatusHovered && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-50 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl shadow-black/60 p-1.5 min-w-[110px]"
                          onMouseEnter={() => setHoveredStage(stage)}
                          onMouseLeave={() => setHoveredStage(null)}
                        >
                          <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest px-2 py-1 mb-0.5">切换状态</div>
                          {allStatuses.map(st => (
                            <button
                              key={st.key}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStageStatusChange(stage, st.key);
                              }}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                status === st.key
                                  ? `${st.bg} ${st.color} ring-1 ring-white/10`
                                  : `text-gray-500 ${st.hoverColor} ${st.hoverBg}`
                              }`}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                              {st.label}
                              {status === st.key && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Version Management (Right) */}
            <div className="col-span-9 space-y-6">
              {selectedStage === 'Creative' ? (
                <>
                  {/* ===== CREATIVE STAGE VIEW ===== */}
                  
                  {/* Section Header */}
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center border border-purple-500/20">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">创意参考 (Creative References)</h3>
                        <p className="text-[9px] text-gray-600">{selectedShot?.name} — 图片参考 & 视频参考</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => creativeFileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-purple-600/20 transition-all"
                      >
                        <Upload className="w-3.5 h-3.5" /> 上传参考素材
                      </button>
                      <input
                        ref={creativeFileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*"
                        multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          for (const file of files) {
                            await handleCreativeUpload(file);
                          }
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>

                  {/* Image Reference Board — PureRef2 Style */}
                  <div
                    className="rounded-2xl border border-white/5 overflow-hidden relative"
                    style={{ backgroundColor: boardBgColor }}
                  >
                    {/* ===== PureRef2 Toolbar (top-right floating) - B&W Gray slider ===== */}
                    <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-xl px-2 py-1.5 border border-white/[0.08]">
                      {/* Zoom controls */}
                      <button
                        onClick={() => setBoardZoom(prev => Math.min(5, prev * 1.15))}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                        title="放大"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-1 text-[9px] font-mono text-white/40 min-w-[36px] text-center">
                        {Math.round(boardZoom * 100)}%
                      </span>
                      <button
                        onClick={() => setBoardZoom(prev => Math.max(0.1, prev / 1.15))}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                        title="缩小"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* Reset view */}
                      <button
                        onClick={() => { setBoardZoom(1); setBoardPan({ x: 60, y: 40 }); }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                        title="重置视图"
                      >
                        <Move className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* B&W Gray color slider - same as global board */}
                      <div className="flex items-center gap-1.5">
                        {[
                          { c: '#ffffff', n: '白色' },
                          { c: '#2a2a2a', n: '深灰' },
                          { c: '#1e1e1e', n: '黑色' },
                        ].map(bg => (
                          <button
                            key={bg.c}
                            onClick={() => setBoardBgColor(bg.c)}
                            className={`w-7 h-7 rounded-lg border-2 transition-all duration-150 ${
                              boardBgColor === bg.c
                                ? 'border-white/80 scale-105 shadow-lg shadow-black/30'
                                : 'border-white/15 hover:border-white/35 hover:scale-105'
                            }`}
                            style={{ backgroundColor: bg.c }}
                            title={bg.n}
                          />
                        ))}
                      </div>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* Delete selected */}
                      <button
                        onClick={async () => {
                          for (const id of Array.from(selectedImgIds)) {
                            await handleDeleteShotRef(id);
                          }
                          setSelectedImgIds(new Set());
                          setImgPositions(prev => {
                            const next = { ...prev };
                            for (const id of Array.from(selectedImgIds)) delete next[id];
                            saveBoardPositions();
                            return next;
                          });
                        }}
                        disabled={selectedImgIds.size === 0}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                          selectedImgIds.size > 0
                            ? 'text-red-400 hover:text-red-300 hover:bg-red-500/15'
                            : 'text-white/20 cursor-not-allowed'
                        }`}
                        title="删除选中"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Label (top-left) */}
                    <div className="absolute top-2.5 left-2.5 z-30 flex items-center gap-2">
                      <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-sm border ${boardBgColor === '#ffffff' ? 'bg-black/8 border-black/10' : 'bg-white/[0.06] border-white/[0.08]'}`}>
                        <Image className={`w-3 h-3 ${boardBgColor === '#ffffff' ? 'text-gray-500' : 'text-white/45'}`} />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${boardBgColor === '#ffffff' ? 'text-gray-600' : 'text-white/45'}`}>
                          图片参考 · {shotImageRefs.length}张{selectedImgIds.size > 0 && ` · ${selectedImgIds.size}已选`}
                        </span>
                      </div>
                    </div>

                    {/* Hints bar (bottom-left) */}
                    <div className={`absolute bottom-2 left-2.5 z-30 text-[8px] space-x-2 select-none pointer-events-none ${boardBgColor === '#ffffff' ? 'text-gray-400' : 'text-white/20'}`}>
                      <span>滚轮缩放</span>·<span>Alt+拖拽平移</span>·<span>拖拽移动</span>·<span>Ctrl多选</span>·<span>Ctrl+V粘贴</span>
                    </div>

                    {/* ===== Board Canvas ===== */}
                    <div
                      ref={boardContainerRef}
                      className="w-full h-[520px] overflow-hidden relative select-none"
                      style={{ cursor: isBoardPanning ? 'grabbing' : draggingImgId ? 'grabbing' : 'default' }}
                      onWheel={handleBoardWheel}
                      onMouseDown={handleBoardMouseDown}
                      onMouseMove={handleBoardMouseMove}
                      onMouseUp={handleBoardMouseUp}
                      onMouseLeave={handleBoardMouseUp}
                      onPaste={handleBoardPaste}
                      onClick={() => setContextMenu(null)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const files = Array.from(e.dataTransfer.files);
                        for (const file of files) {
                          if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                            await handleCreativeUpload(file);
                          }
                        }
                      }}
                      tabIndex={0} // 允许接收键盘事件
                      onKeyDown={(e) => {
                        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedImgIds.size > 0) {
                          // Delete key batch delete
                          (async () => {
                            for (const id of Array.from(selectedImgIds)) {
                              await handleDeleteShotRef(id);
                            }
                            setImgPositions(prev => {
                              const next = { ...prev };
                              for (const id of Array.from(selectedImgIds)) delete next[id];
                              return next;
                            });
                            setSelectedImgIds(new Set());
                          })();
                        }
                      }}
                    >
                      {/* Grid Background (PureRef2-style dot grid) */}
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
                          backgroundSize: `${24 * boardZoom}px ${24 * boardZoom}px`,
                          backgroundPosition: `${boardPan.x}px ${boardPan.y}px`,
                        }}
                      />

                      {/* Images Layer */}
                      <div
                        className="absolute origin-top-left"
                        style={{
                          transform: `translate(${boardPan.x}px, ${boardPan.y}px) scale(${boardZoom})`,
                          width: '8000px',
                          height: '8000px',
                        }}
                      >
                        {shotImageRefs.map(ref => {
                          const pos = imgPositions[ref.id ?? 0];
                          // 即使没有位置信息也显示（用默认位置），避免新上传的图片不可见
                          const safePos = pos || { x: 60, y: 60, w: 260, h: 180 };

                          const isSelected = selectedImgIds.has(ref.id!);
                          const isDragging = draggingImgId === ref.id;
                          const isResizing = resizingImgId === ref.id;

                          return (
                            <div
                              key={ref.id}
                              className={`absolute group/img rounded overflow-hidden ${
                                isDragging
                                  ? 'ring-1 ring-blue-500/60 z-50'
                                  : isSelected
                                    ? 'ring-1 ring-blue-400/50'
                                    : 'ring-1 ring-white/[0.06] hover:ring-white/[0.15]'
                              }`}
                              style={{
                                left: safePos.x,
                                top: safePos.y,
                                width: safePos.w,
                                height: safePos.h,
                                backgroundColor: boardBgColor === '#ffffff' ? '#f0f0f0' : '#222',
                                cursor: isDragging ? 'grabbing' : isResizing ? 'nwse-resize' : 'grab',
                                pointerEvents: 'auto',
                              }}
                              onMouseDown={(e) => handleImgMouseDown(e, ref.id!)}
                            >
                              {/* Image - maintain aspect ratio, no shadow, flat */}
                              <img
                                src={ref.url || ref.thumbnailUrl}
                                alt={ref.name}
                                className="w-full h-full object-contain pointer-events-none select-none"
                                draggable={false}
                                style={{ background: boardBgColor === '#ffffff' ? '#f5f5f5' : '#2a2a2a' }}
                              />

                              {/* Selection indicator (top-left corner) - subtle */}
                              {(isSelected || isDragging) && (
                                <div className={`absolute top-0 left-0 w-3 h-3 ${isDragging ? 'bg-blue-500' : 'bg-blue-400/70'} rounded-br z-10`} />
                              )}

                              {/* Name bar (bottom) */}
                              <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                <p className="text-[8px] font-medium text-white/80 truncate leading-tight">{ref.name}</p>
                              </div>

                              {/* Action buttons (top-right) - only show on hover or selection */}
                              <div className={`absolute top-1 right-1 flex items-center gap-0.5 transition-opacity ${
                                isSelected ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'
                              }`}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteShotRef(ref.id!); }}
                                  className="w-4.5 h-4.5 bg-black/60 hover:bg-red-500/90 rounded flex items-center justify-center text-white/70 hover:text-white transition-colors"
                                  title="删除"
                                  style={{ width: 18, height: 18 }}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* Resize handle (bottom-right) - subtle flat */}
                              <div
                                className="absolute bottom-0 right-0 w-4 h-4 opacity-0 group-hover/img:opacity-100 transition-opacity z-10"
                                onMouseDown={(e) => handleResizeMouseDown(e, ref.id!)}
                                style={{
                                  cursor: 'nwse-resize',
                                  background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)',
                                  borderRadius: '0 0 0 4px',
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Empty State */}
                      {shotImageRefs.length === 0 && (
                        <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none ${boardBgColor === '#ffffff' ? 'text-gray-400' : 'text-gray-500'}`}>
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border border-dashed ${boardBgColor === '#ffffff' ? 'bg-gray-100 border-gray-300' : 'bg-white/[0.04] border-white/10'}`}>
                            <Image className={`w-7 h-7 ${boardBgColor === '#ffffff' ? 'opacity-30' : 'opacity-25'}`} />
                          </div>
                          <p className="text-xs font-medium">拖放图片到画布，或 Ctrl+V 粘贴</p>
                          <p className={`text-[9px] mt-1 ${boardBgColor === '#ffffff' ? 'text-gray-400' : 'text-gray-600'}`}>支持批量拖放 · 滚轮缩放 · Alt+拖拽平移</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Video Reference Cards */}
                  <div
                    className="space-y-3"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const files = Array.from(e.dataTransfer.files);
                      for (const file of files) {
                        if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
                          await handleCreativeUpload(file);
                        }
                      }
                    }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <div className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-1.5">
                          <FilmIcon className="w-3 h-3 text-blue-400" />
                          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">视频参考</span>
                        </div>
                        <span className="text-[9px] text-gray-600 font-mono">{shotVideoRefs.length} 个视频 · 单击放大 · 悬停预览 · 右键菜单 · 拖放上传</span>
                      </div>
                    </div>

                    {shotVideoRefs.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {shotVideoRefs.map(ref => (
                          <div
                            key={ref.id}
                            className="group/vid glass-panel rounded-2xl overflow-hidden border border-transparent hover:border-white/10 transition-all relative cursor-pointer"
                            onMouseEnter={() => setHoveredVideoRefId(ref.id || null)}
                            onMouseLeave={() => setHoveredVideoRefId(null)}
                            onContextMenu={(e) => handleVideoContextMenu(e, ref)}
                            onClick={() => setVideoPreviewUrl(ref.url)}
                          >
                              {/* Thumbnail / Preview */}
                              <div className="aspect-video bg-black/50 overflow-hidden relative">
                                {hoveredVideoRefId === ref.id && ref.url ? (
                                  <video
                                    key={`play-${ref.id}`}
                                    src={ref.url}
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900/30 to-purple-900/30">
                                    {ref.thumbnailUrl ? (
                                      <img src={ref.thumbnailUrl} className="w-full h-full object-cover absolute inset-0" draggable={false} />
                                    ) : (
                                      <FilmIcon className="w-8 h-8 text-blue-400/30" />
                                    )}
                                  </div>
                                )}

                                {/* Hover Play Indicator */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-100 group-hover/vid:opacity-0 transition-opacity pointer-events-none">
                                  <div className="w-8 h-8 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center">
                                    <Play className="w-4 h-4 text-white ml-0.5" />
                                  </div>
                                </div>

                                {/* Type Badge */}
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-blue-600/80 backdrop-blur-md rounded text-[7px] font-bold text-white uppercase tracking-wider">
                                  VIDEO
                                </div>
                              </div>

                              {/* Info */}
                              <div className="p-3 flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-bold text-white truncate">{ref.name}</p>
                                  <p className="text-[8px] text-gray-600 mt-0.5">{format(ref.createdAt, 'MM-dd HH:mm')}</p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/vid:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setVideoPreviewUrl(ref.url); }}
                                    className="p-1 rounded-md text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                    title="放大播放"
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteShotRef(ref.id!); }}
                                    className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 flex flex-col items-center justify-center text-gray-600 rounded-2xl border border-dashed border-white/5">
                        <FilmIcon className="w-10 h-10 opacity-15 mb-3" />
                        <p className="text-xs">暂无视频参考</p>
                        <p className="text-[9px] text-gray-700 mt-1">拖放视频文件到此处，或点击上方按钮上传</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
              <>
              {/* Normal Version Management for non-Creative stages */}
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center border border-yellow-500/20">
                    <History className="w-4 h-4 text-yellow-500" />
                  </div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">文件版本 (Versions)</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-blue-600/20 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" /> 上传新版本
                    <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleUploadVersion} />
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-400 hover:text-white transition-all">
                    <RefreshCw className="w-3 h-3" /> 自动重命名
                  </button>
                  <span className="text-[10px] font-mono text-gray-600">{versions.length} 个文件</span>
                </div>
              </div>

              {/* Version List */}
              <div className="space-y-3">
                {versions.map(v => {
                  const isSelected = selectedVersion?.id === v.id;
                  const isHovered = hoveredVersionId === v.id;
                  const previewUrl = v.videoBlob ? URL.createObjectURL(v.videoBlob) : v.videoUrl;

                  return (
                    <div
                      key={v.id}
                      onMouseEnter={() => setHoveredVersionId(v.id || null)}
                      onMouseLeave={() => setHoveredVersionId(null)}
                      onClick={() => openRVPlayer(v)}
                      className="glass-panel rounded-[1.5rem] p-3 flex items-center gap-6 transition-all group border cursor-pointer ${
                        isSelected ? 'border-blue-500/30 ring-1 ring-blue-500/20 bg-white/5' : 'hover:border-white/10 border-transparent'
                      }"
                    >
                      {/* Thumbnail/Player Area */}
                      <div className="w-48 aspect-video bg-black rounded-xl overflow-hidden relative flex-shrink-0 border border-white/5">
                        {isHovered && previewUrl ? (
                          <video
                            src={previewUrl}
                            autoPlay
                            muted
                            loop
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={v.thumbnailUrl || `https://picsum.photos/seed/${v.name}/320/180`}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                            referrerPolicy="no-referrer"
                          />
                        )}

                        {/* Stage Label (Top Left) - hidden during hover preview */}
                        {!isHovered && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600/80 backdrop-blur-md rounded text-[8px] font-black text-white uppercase tracking-widest">
                            {v.stageName}
                          </div>
                        )}

                        {/* Version Badge (Bottom Right) - always visible */}
                        {!isHovered && (
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[9px] font-mono font-bold text-white/90 border border-white/10">
                            v{String(v.versionNumber || 0).padStart(3, '0')}
                          </div>
                        )}

                        {/* Play button overlay - hidden during hover preview */}
                        {!isHovered && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedVersion(v); }}
                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
                              <Play className="w-5 h-5 ml-0.5" />
                            </div>
                          </button>
                        )}
                      </div>

                      {/* Spread-out Info (Table-like) */}
                      <div className="flex-1 grid grid-cols-4 gap-6 items-center">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">版本名称</p>
                          <p className={`text-sm font-bold truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>
                            {`${selectedProject ? getProjectAbbr(selectedProject.name) : 'CF'}_${selectedShot?.name || 'SHOOT'}_${v.stageName || 'STAGE'}_${String(v.versionNumber || 0).padStart(3, '0')}`}
                          </p>
                          <p className="text-[9px] text-gray-600 font-mono mt-0.5">{v.name}</p>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">元数据</p>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono">
                            <span className="flex items-center gap-1"><Maximize2 className="w-3 h-3" /> {v.metadata?.resolution || '1920x1080'}</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {v.metadata?.fps || 24}fps</span>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">时长 / 大小</p>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {v.metadata?.duration ? v.metadata.duration.toFixed(2) : '0.00'}s</span>
                            <span className="flex items-center gap-1"><Info className="w-3 h-3" /> {v.metadata?.fileSize ? (v.metadata.fileSize / 1024 / 1024).toFixed(1) : '0.0'}MB</span>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pr-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openCompare(v); }}
                            className="p-2 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg text-purple-400 hover:text-purple-300 transition-all"
                            title="版本对比"
                          >
                            <GitCompare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm('确定要删除这个版本吗？')) {
                                await db.versions.delete(v.id!);
                                const shotVersions = await db.versions
                                  .where('shotId').equals(selectedShot!.id!)
                                  .and(ver => ver.stageName === selectedStage)
                                  .sortBy('versionNumber');
                                setVersions(shotVersions.reverse());
                              }
                            }}
                            className="p-2 bg-white/5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                            title="删除版本"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); }}
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {versions.length === 0 && (
                  <div className="py-20 flex flex-col items-center justify-center text-gray-600 space-y-4">
                    <FileVideo className="w-12 h-12 opacity-20" />
                    <p className="text-sm">该阶段暂无版本文件</p>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </div>
          </div>
        </>
        )}
      </main>
      </>
      )}

      {/* ===== Video Compare Modal (版本对比) ===== */}
      <AnimatePresence>
        {isCompareOpen && compareVersionA && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-2xl flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-[92vw] h-[88vh] bg-zinc-900 rounded-[2rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Compare Header */}
              <div className="h-14 bg-zinc-950/80 border-b border-white/5 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setIsCompareOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">版本对比</h3>
                    <p className="text-[10px] text-gray-500 font-mono">{compareVersionA.name} vs {compareVersionB?.name || '未选择'}</p>
                  </div>
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1">
                  {[
                    { mode: 'side-by-side' as const, icon: Columns, label: '并排' },
                    { mode: 'overlay' as const, icon: Layers2, label: '叠加' },
                    { mode: 'swipe' as const, icon: GripVertical, label: '拖动' },
                  ].map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setCompareMode(mode)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        compareMode === mode
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'text-gray-500 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Version B Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-500">对比版本:</span>
                  <select
                    value={compareVersionB?.id || ''}
                    onChange={(e) => {
                      const v = versions.find(ver => ver.id === parseInt(e.target.value));
                      if (v) setCompareVersionB(v);
                    }}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50"
                  >
                    {versions.filter(v => v.id !== compareVersionA.id).map(v => (
                      <option key={v.id} value={v.id}>V{String(v.versionNumber).padStart(3,'0')} — {v.stageName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compare Video Viewport */}
              <div
                className={`flex-1 relative overflow-hidden bg-[#050505] ${
                  compareMode === 'side-by-side' ? 'flex' : ''
                }`}
                style={{
                  cursor: compareMode === 'swipe' ? 'col-resize' : 'default',
                }}
              >
                {/* ========== SIDE-BY-SIDE MODE ========== */}
                {compareMode === 'side-by-side' && (
                  <div className="flex-1 flex divide-x divide-white/10">
                    {/* Video A */}
                    <div className="flex-1 relative flex items-center justify-center group">
                      <video
                        ref={compareVideoRefA}
                        src={compareVersionA.videoBlob ? URL.createObjectURL(compareVersionA.videoBlob) : compareVersionA.videoUrl}
                        playsInline
                        className="max-h-full max-w-full object-contain"
                        style={{ filter: `brightness(${compareBrightness}%)` }}
                        onTimeUpdate={handleCompareTimeUpdate}
                        onLoadedMetadata={(e) => setCompareDuration(e.currentTarget.duration)}
                      />
                      <div className="absolute top-4 left-4 px-2.5 py-1 bg-blue-600/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider pointer-events-none">
                        A · {compareVersionA.stageName} V{String(compareVersionA.versionNumber).padStart(3,'0')}
                      </div>
                    </div>
                    {/* Video B */}
                    <div className="flex-1 relative flex items-center justify-center group">
                      {compareVersionB ? (
                        <>
                          <video
                            ref={compareVideoRefB}
                            src={compareVersionB.videoBlob ? URL.createObjectURL(compareVersionB.videoBlob) : compareVersionB.videoUrl}
                            playsInline
                            className="max-h-full max-w-full object-contain"
                            style={{ filter: `brightness(${compareBrightness}%)` }}
                          />
                          <div className="absolute top-4 left-4 px-2.5 py-1 bg-purple-600/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider pointer-events-none">
                            B · {compareVersionB.stageName} V{String(compareVersionB.versionNumber).padStart(3,'0')}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-600 space-y-3">
                          <GitCompare className="w-12 h-12 opacity-15" />
                          <p className="text-sm">请在右上角选择对比版本</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ========== OVERLAY MODE ========== */}
                {compareMode === 'overlay' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* Video A (base layer) */}
                    <video
                      ref={compareVideoRefA}
                      src={compareVersionA.videoBlob ? URL.createObjectURL(compareVersionA.videoBlob) : compareVersionA.videoUrl}
                      playsInline
                      className="max-h-full max-w-full object-contain absolute"
                      style={{ filter: `brightness(${compareBrightness}%)` }}
                      onTimeUpdate={handleCompareTimeUpdate}
                      onLoadedMetadata={(e) => setCompareDuration(e.currentTarget.duration)}
                    />
                    {/* Video B (overlay with opacity) */}
                    {compareVersionB && (
                      <video
                        ref={compareVideoRefB}
                        src={compareVersionB.videoBlob ? URL.createObjectURL(compareVersionB.videoBlob) : compareVersionB.videoUrl}
                        playsInline
                        className="max-h-full max-w-full object-contain absolute"
                        style={{
                          opacity: compareOverlayOpacity,
                          mixBlendMode: 'normal',
                          filter: `brightness(${compareBrightness}%)`,
                        }}
                      />
                    )}
                    {/* Labels */}
                    <div className="absolute top-4 left-4 px-2.5 py-1 bg-blue-600/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider pointer-events-none">
                      A
                    </div>
                    {compareVersionB && (
                      <div className="absolute top-4 right-4 px-2.5 py-1 bg-purple-600/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider pointer-events-none">
                        B ({Math.round(compareOverlayOpacity * 100)}%)
                      </div>
                    )}
                  </div>
                )}

                {/* ========== SWIPE MODE ========== */}
                {compareMode === 'swipe' && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    onMouseMove={(e) => {
                      if (!e.buttons) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setCompareSwipePos(((e.clientX - rect.left) / rect.width) * 100);
                    }}
                  >
                    <div className="relative max-h-full max-w-full" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {/* Video A (left side) - clipped by container */}
                      <video
                        ref={compareVideoRefA}
                        src={compareVersionA.videoBlob ? URL.createObjectURL(compareVersionA.videoBlob) : compareVersionA.videoUrl}
                        playsInline
                        className="object-contain"
                        style={{
                          position: 'absolute',
                          maxWidth: '100%',
                          maxHeight: '100%',
                          clipPath: `inset(0 ${100 - compareSwipePos}% 0 0)`,
                          filter: `brightness(${compareBrightness}%)`,
                        }}
                        onTimeUpdate={handleCompareTimeUpdate}
                        onLoadedMetadata={(e) => setCompareDuration(e.currentTarget.duration)}
                      />
                      {/* Video B (right side) - clipped to right portion */}
                      {compareVersionB && (
                        <video
                          ref={compareVideoRefB}
                          src={compareVersionB.videoBlob ? URL.createObjectURL(compareVersionB.videoBlob) : compareVersionB.videoUrl}
                          playsInline
                          className="object-contain"
                          style={{
                            position: 'absolute',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            clipPath: `inset(0 0 0 ${compareSwipePos}%)`,
                            filter: `brightness(${compareBrightness}%)`,
                          }}
                        />
                      )}
                      {/* Swipe Line Handle */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white cursor-col-resize z-10 shadow-xl shadow-white/30"
                        style={{ left: `${compareSwipePos}%`, transform: 'translateX(-50%)' }}
                        onMouseDown={() => {}}
                      >
                        {/* Drag handle circle */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4 text-zinc-800" />
                        </div>
                      </div>
                      {/* Labels */}
                      <div className="absolute bottom-6 left-6 px-2.5 py-1 bg-blue-600/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider pointer-events-none z-20">
                        A
                      </div>
                      {compareVersionB && (
                        <div className="absolute bottom-6 right-6 px-2.5 py-1 bg-purple-600/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white uppercase tracking-wider pointer-events-none z-20">
                          B
                        </div>
                      )}
                      {!compareVersionB && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                          <p className="text-sm text-gray-400">请选择对比版本</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Compare Control Bar */}
              <div className="shrink-0 p-4 border-t border-white/5 bg-zinc-950/80">
                <div className="glass-panel rounded-2xl p-3 flex items-center gap-6 border border-white/10 shadow-2xl backdrop-blur-2xl max-w-5xl mx-auto">
                  {/* Play/Pause + Frame Step */}
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleCompareSeek(Math.max(0, compareCurrentTime - 1/24))} className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
                    <button
                      onClick={() => setCompareIsPlaying(!compareIsPlaying)}
                      className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/30"
                    >
                      {compareIsPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>
                    <button onClick={() => handleCompareSeek(Math.min(compareDuration, compareCurrentTime + 1/24))} className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white"><ChevronRight className="w-5 h-5" /></button>
                  </div>

                  <div className="h-8 w-px bg-white/10 mx-1" />

                  {/* Speed Control */}
                  <div className="flex flex-col items-center gap-1 group relative">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/50 transition-all cursor-pointer">
                      <FastForward className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[11px] font-mono font-bold text-white">{comparePlaybackRate}x</span>
                    </div>
                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto z-30">
                      <div className="bg-zinc-900 border border-white/10 rounded-xl p-1 flex flex-col gap-1 shadow-2xl">
                        {[0.25, 0.5, 0.7, 1.0, 1.2, 1.5, 2.0].map(rate => (
                          <button
                            key={rate}
                            onClick={() => setComparePlaybackRate(rate)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all ${
                              comparePlaybackRate === rate ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                          >{rate.toFixed(2)}x</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Loop Toggle */}
                  <button
                    onClick={() => setCompareLooping(!compareLooping)}
                    className={`p-2.5 rounded-xl transition-all ${
                      compareLooping ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}
                    title="循环播放"
                  >
                    <RefreshCw className={`w-4 h-4 ${compareLooping ? 'animate-spin-slow' : ''}`} />
                  </button>

                  {/* Overlay Opacity Slider (only in overlay mode) */}
                  {compareMode === 'overlay' && (
                    <>
                      <div className="h-8 w-px bg-white/10 mx-1" />
                      <div className="flex items-center gap-2">
                        <Layers2 className="w-3.5 h-3.5 text-purple-400" />
                        <input
                          type="range" min="0" max="100" value={Math.round(compareOverlayOpacity * 100)}
                          onChange={(e) => setCompareOverlayOpacity(parseInt(e.target.value) / 100)}
                          className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
                        />
                        <span className="text-[10px] font-mono text-gray-500 w-8">{Math.round(compareOverlayOpacity * 100)}%</span>
                      </div>
                    </>
                  )}

                  <div className="h-8 w-px bg-white/10 mx-1" />

                  {/* Brightness */}
                  <div className="flex items-center gap-2">
                    <Sun className="w-3.5 h-3.5 text-yellow-500" />
                    <input
                      type="range" min="50" max="200" value={compareBrightness}
                      onChange={(e) => setCompareBrightness(parseInt(e.target.value))}
                      className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-500"
                    />
                  </div>

                  <div className="h-8 w-px bg-white/10 mx-1" />

                  {/* Timeline / Seek */}
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="range" min="0" max={compareDuration || 0} step="0.001"
                      value={compareCurrentTime}
                      onChange={(e) => handleCompareSeek(parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-500/40 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:mt-[-4px]"
                    />
                  </div>

                  {/* Timecode */}
                  <div className="flex items-center gap-4 px-3">
                    <div className="text-right">
                      <p className="text-[10px] font-mono text-gray-500">TC</p>
                      <p className="text-xs font-mono text-white font-bold tabular-nums">
                        {Math.floor(compareCurrentTime / 60).toString().padStart(2,'0')}:{Math.floor(compareCurrentTime % 60).toString().padStart(2,'0')}.{String(Math.floor((compareCurrentTime % 1) * 24)).padStart(2,'0')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shot Detection Modal */}
      <AnimatePresence>
        {isShotDetectionModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-brand-bg/95 backdrop-blur-xl flex items-center justify-center p-8"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="glass-panel rounded-[3rem] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden border-white/10 shadow-2xl"
            >
              {/* Header */}
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center text-blue-500">
                    <Scissors className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">智能镜头检测</h3>
                    <p className="text-xs text-gray-500 font-medium">自动识别视频剪辑点，快速生成分镜列表</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsShotDetectionModal(false);
                    setDetectionVideoFile(null);
                    setDetectionVideoUrl(null);
                  }}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col p-8 gap-8">
                {isDetecting ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                    <div className="relative w-32 h-32">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="60"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          className="text-white/5"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="60"
                          stroke="currentColor"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={377}
                          strokeDashoffset={377 - (377 * detectionProgress) / 100}
                          className="text-blue-500 transition-all duration-300"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-black text-white">{Math.round(detectionProgress)}%</span>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <h4 className="text-lg font-bold text-white">正在分析视频流...</h4>
                      <p className="text-xs text-gray-500 max-w-xs mx-auto">
                        我们正在使用高精度直方图算法检测每一个剪辑点，请稍候。
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Video Player */}
                    <div className="flex-1 bg-black rounded-[2rem] overflow-hidden relative group border border-white/5 shadow-inner">
                      <video 
                        ref={videoRef}
                        src={detectionVideoUrl || undefined}
                        className="w-full h-full object-contain"
                        controls={false}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                      />
                      
                      {/* Playback Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20">
                          {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
                        </div>
                      </div>
                      
                      {/* Click to Play/Pause */}
                      <button 
                        className="absolute inset-0 w-full h-full"
                        onClick={() => {
                          if (videoRef.current) {
                            if (isPlaying) videoRef.current.pause();
                            else videoRef.current.play();
                            setIsPlaying(!isPlaying);
                          }
                        }}
                      />
                    </div>

                    {/* Timeline */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">剪辑点 (Detected Cuts)</span>
                          <span className="px-2 py-0.5 bg-blue-600/10 text-blue-400 text-[10px] font-black rounded-full">
                            {detectedCuts.length} 个镜头
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                          <span>{formatTime(currentTime)}</span>
                          <span className="text-gray-700">/</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      {/* Timeline Bar */}
                      <div className="relative h-24 bg-white/2 rounded-2xl border border-white/5 group/timeline">
                        {/* Time Markers */}
                        <div className="absolute inset-0 flex items-end px-4 pb-2 gap-8 opacity-20 pointer-events-none">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-4 w-px bg-white" />
                          ))}
                        </div>

                        {/* Cut Markers */}
                        {detectedCuts.map((cut, idx) => (
                          <div 
                            key={idx}
                            style={{ left: `${(cut / duration) * 100}%` }}
                            className="absolute top-0 bottom-0 w-px bg-blue-500 z-10 group/cut"
                          >
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[8px] font-black text-white shadow-lg shadow-blue-500/40 cursor-grab active:cursor-grabbing">
                              {idx + 1}
                            </div>
                            {/* Drag Handle */}
                            <div 
                              className="absolute inset-y-0 -left-2 -right-2 cursor-ew-resize"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setIsDraggingCut(idx);
                              }}
                            />
                            {/* Remove Button */}
                            <button 
                              onClick={() => setDetectedCuts(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover/cut:opacity-100 transition-opacity shadow-lg shadow-red-500/40"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        ))}

                        {/* Current Time Indicator */}
                        <div 
                          style={{ left: `${(currentTime / duration) * 100}%` }}
                          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                        >
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 -translate-y-1/2" />
                        </div>

                        {/* Click to Seek / Add Cut */}
                        <div 
                          className="absolute inset-0 cursor-crosshair"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const time = (x / rect.width) * duration;
                            if (videoRef.current) videoRef.current.currentTime = time;
                          }}
                          onDoubleClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const time = (x / rect.width) * duration;
                            setDetectedCuts(prev => [...prev, time].sort((a, b) => a - b));
                          }}
                        />
                      </div>
                      
                      <p className="text-[10px] text-gray-600 text-center italic">
                        提示：拖拽标记点微调，双击空白处添加剪辑点，点击标记点底部红色按钮删除。
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>检测到 {detectedCuts.length} 个镜头</span>
                  </div>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>总时长: {formatTime(duration)}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                      setIsShotDetectionModal(false);
                      setDetectionVideoFile(null);
                      setDetectionVideoUrl(null);
                    }}
                    className="px-8 py-4 bg-white/5 hover:bg-white/10 text-gray-400 rounded-2xl font-bold transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={async () => {
                      if (!selectedProject) {
                        const name = prompt('请输入新项目名称：', '新项目 (自动分镜)');
                        if (name) {
                          const id = await db.projects.add({
                            name,
                            description: '通过视频自动检测生成的项目',
                            createdAt: new Date(),
                            updatedAt: new Date(),
                          });
                          const newProj = await db.projects.get(id);
                          if (newProj) {
                            setSelectedProject(newProj);
                            setIsProjectSelection(false);
                            handleCreateFromCuts(newProj);
                          }
                        }
                      } else {
                        handleCreateFromCuts();
                      }
                    }}
                    disabled={isDetecting || detectedCuts.length === 0 || isCreatingFromCuts}
                    className="px-12 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-bold shadow-xl shadow-blue-600/20 transition-all flex items-center gap-3"
                  >
                    {isCreatingFromCuts ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        正在生成镜头...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        确认并生成镜头
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Project Add Modal */}
      <AnimatePresence>
        {isAddingProjectModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-brand-bg/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel rounded-[2.5rem] p-10 max-w-md w-full space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 mx-auto">
                  <LayoutGrid className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white">新建项目</h3>
                <p className="text-xs text-gray-500">为你的新创作命名</p>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">项目名称</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="输入项目名称..."
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddProject()}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-lg font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => {
                    setIsAddingProjectModal(false);
                    setNewProjectName('');
                  }}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-gray-400 rounded-2xl font-bold transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={handleAddProject}
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-4 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                  确认创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Project Confirm Dialog */}
      <AnimatePresence>
        {deleteConfirmProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteConfirmProject(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">删除项目</h3>
                  <p className="text-[10px] text-gray-500">此操作不可撤销</p>
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 mb-5">
                <p className="text-sm text-gray-300">
                  确定要删除项目 <span className="font-bold text-red-400">"{deleteConfirmProject.name}"</span> 吗？
                </p>
                <p className="text-[10px] text-gray-500 mt-1.5">
                  将同时删除该项目下的所有镜头、版本、任务和参考素材。音效库素材将保留（全局共享）。
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmProject(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDeleteProject(deleteConfirmProject)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all shadow-lg shadow-red-600/20"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shot Add Modal */}
      <AnimatePresence>
        {isAddingShotModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-brand-bg/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel rounded-[2.5rem] p-10 max-w-md w-full space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 mx-auto">
                  <Film className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white">新建镜头</h3>
                <p className="text-xs text-gray-500">设置镜头编号或名称</p>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">镜头名称</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="例如 SH010..."
                  value={newShotName}
                  onChange={e => setNewShotName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddShot()}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-lg font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">快捷操作</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={async () => {
                      const existingShots = await db.shots.where('projectId').equals(selectedProject!.id!).toArray();
                      const nextName = getNextShotName(existingShots);
                      setNewShotName(nextName);
                    }}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> 建议下一个
                  </button>
                  <button 
                    onClick={() => {
                      handleBatchAddShots(10);
                      setIsAddingShotModal(false);
                    }}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Layers className="w-3 h-3" /> 批量 +10
                  </button>
                  <button 
                    onClick={() => {
                      handleBatchAddShots(20);
                      setIsAddingShotModal(false);
                    }}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Layers className="w-3 h-3" /> 批量 +20
                  </button>
                  <button 
                    onClick={() => {
                      setIsBatchAddingShots(true);
                      setIsAddingShotModal(false);
                    }}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Settings2 className="w-3 h-3" /> 自定义批量
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => {
                    setIsAddingShotModal(false);
                    setNewShotName('');
                  }}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-gray-400 rounded-2xl font-bold transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={handleAddShot}
                  disabled={!newShotName.trim()}
                  className="flex-1 py-4 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                  确认创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Add Modal */}
      <AnimatePresence>
        {isBatchAddingShots && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-brand-bg/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass-panel rounded-[2.5rem] p-10 max-w-md w-full space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 mx-auto">
                  <Layers className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white">批量新建镜头</h3>
                <p className="text-xs text-gray-500">将按 SH010, SH020... 规则自动生成</p>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">镜头数量</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" 
                    min="1" 
                    max="50"
                    value={batchShotCount}
                    onChange={e => setBatchShotCount(parseInt(e.target.value) || 1)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-xl font-bold text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <div className="flex flex-col gap-2">
                    <button onClick={() => setBatchShotCount(prev => Math.min(prev + 1, 50))} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400"><ChevronDown className="w-4 h-4 rotate-180" /></button>
                    <button onClick={() => setBatchShotCount(prev => Math.max(prev - 1, 1))} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400"><ChevronDown className="w-4 h-4" /></button>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {[5, 10, 20].map(n => (
                    <button 
                      key={n}
                      onClick={() => setBatchShotCount(n)}
                      className={`py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${
                        batchShotCount === n ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10'
                      }`}
                    >
                      预设 {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setIsBatchAddingShots(false)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-gray-400 rounded-2xl font-bold transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={handleBatchAddShots}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                  确认创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Creative Panel Modal (Image/Video/Music/SFX/Asset Reference Manager) */}
      <AnimatePresence>
        {isCreativePanelModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-brand-bg/90 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => { setIsCreativePanelModal(false); setCreativeActiveTab(null); }}
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-panel rounded-[2.5rem] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border-white/10 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    creativeModalTab === 'image-ref' ? 'bg-emerald-400/10 text-emerald-400' :
                    creativeModalTab === 'video-ref' ? 'bg-blue-400/10 text-blue-400' :
                    creativeModalTab === 'music-ref' ? 'bg-pink-400/10 text-pink-400' :
                    creativeModalTab === 'sfx-lib' ? 'bg-orange-400/10 text-orange-400' :
                    'bg-cyan-400/10 text-cyan-400'
                  }`}>
                    {creativeModalTab === 'image-ref' && <Image className="w-5 h-5" />}
                    {creativeModalTab === 'video-ref' && <FilmIcon className="w-5 h-5" />}
                    {creativeModalTab === 'music-ref' && <Music className="w-5 h-5" />}
                    {creativeModalTab === 'sfx-lib' && <Volume2 className="w-5 h-5" />}
                    {creativeModalTab === 'asset-lib' && <FolderOpen className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-tight">
                      {creativeModalTab === 'image-ref' ? '图片参考' :
                       creativeModalTab === 'video-ref' ? '视频参考' :
                       creativeModalTab === 'music-ref' ? '音乐参考' :
                       creativeModalTab === 'sfx-lib' ? '音效库' : '资产库'}
                    </h3>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {creativeModalTab === 'image-ref' ? '收集和管理项目视觉参考素材' :
                       creativeModalTab === 'video-ref' ? '收集和管理项目动态参考素材' :
                       creativeModalTab === 'music-ref' ? '收集和管理音乐参考素材' :
                       creativeModalTab === 'sfx-lib' ? '收集和管理音效素材' : '管理项目资产文件'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Tab Switcher */}
                  <div className="flex bg-white/5 rounded-xl p-1 gap-0.5 mr-3">
                    {[
                      { id: 'image-ref', icon: Image, color: 'text-emerald-400' },
                      { id: 'video-ref', icon: FilmIcon, color: 'text-blue-400' },
                      { id: 'music-ref', icon: Music, color: 'text-pink-400' },
                      { id: 'sfx-lib', icon: Volume2, color: 'text-orange-400' },
                      { id: 'asset-lib', icon: FolderOpen, color: 'text-cyan-400' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setCreativeModalTab(tab.id)}
                        className={`p-2 rounded-lg transition-all ${
                          creativeModalTab === tab.id ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                        title={tab.id}
                      >
                        <tab.icon className={`w-3.5 h-3.5 ${creativeModalTab === tab.id ? tab.color : 'text-gray-500'}`} />
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => { setIsCreativePanelModal(false); setCreativeActiveTab(null); }}
                    className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {creativeModalTab === 'image-ref' ? (
                  /* ===== 图片参考：PureRef2 风格画布板 ===== */
                  <div
                    className="flex-1 relative rounded-2xl overflow-hidden m-1"
                    style={{ backgroundColor: globalBoardBgColor }}
                  >
                    {/* Toolbar (top-right) - PureRef2 style: B&W Gray slider */}
                    <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-xl px-2 py-1.5 border border-white/[0.08]">
                      {/* Zoom controls */}
                      <button onClick={() => setGlobalBoardZoom(prev => Math.min(5, prev * 1.15))}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="放大">
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-1 text-[9px] font-mono text-white/40 min-w-[36px] text-center">
                        {Math.round(globalBoardZoom * 100)}%
                      </span>
                      <button onClick={() => setGlobalBoardZoom(prev => Math.max(0.1, prev / 1.15))}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="缩小">
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* Reset view */}
                      <button onClick={() => { setGlobalBoardZoom(1); setGlobalBoardPan({ x: 60, y: 40 }); }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="重置视图">
                        <Move className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* B&W Gray color slider - 3 options like PureRef2 */}
                      <div className="flex items-center gap-1.5">
                        {[
                          { c: '#ffffff', n: '白色' },
                          { c: '#2a2a2a', n: '深灰' },
                          { c: '#1e1e1e', n: '黑色' },
                        ].map(bg => (
                          <button key={bg.c} onClick={() => setGlobalBoardBgColor(bg.c)}
                            className={`w-7 h-7 rounded-lg border-2 transition-all duration-150 ${
                              globalBoardBgColor === bg.c
                                ? 'border-white/80 scale-105 shadow-lg shadow-black/30'
                                : 'border-white/15 hover:border-white/35 hover:scale-105'
                            }`}
                            style={{ backgroundColor: bg.c }} title={bg.n} />
                        ))}
                      </div>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* Import / Export .pur */}
                      <label className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer" title="导入 .pur 文件">
                        <FolderOpen className="w-3.5 h-3.5" />
                        <input type="file" className="hidden" accept=".pur" onChange={handleImportPur} />
                      </label>
                      <button onClick={handleExportPur}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="导出为 .pur">
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-white/10 mx-1" />

                      {/* Delete */}
                      <button onClick={handleGlobalDeleteSelected} disabled={globalSelectedIds.size === 0}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${globalSelectedIds.size > 0 ? 'text-red-400 hover:text-red-300 hover:bg-red-500/15' : 'text-white/20 cursor-not-allowed'}`} title="删除选中">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Label (top-left) */}
                    <div className="absolute top-2.5 left-2.5 z-30 flex items-center gap-2">
                      <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-sm border ${globalBoardBgColor === '#ffffff' ? 'bg-black/8 border-black/10' : 'bg-white/[0.06] border-white/[0.08]'}`}>
                        <Image className={`w-3 h-3 ${globalBoardBgColor === '#ffffff' ? 'text-gray-500' : 'text-white/45'}`} />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${globalBoardBgColor === '#ffffff' ? 'text-gray-600' : 'text-white/45'}`}>
                          图片参考 · {creativePanelRefs.filter(r => r.category === 'image-ref' && !r.shotId).length}张{globalSelectedIds.size > 0 && ` · ${globalSelectedIds.size}已选`}
                        </span>
                      </div>
                    </div>

                    {/* Hints (bottom-left) */}
                    <div className={`absolute bottom-2 left-2.5 z-30 text-[8px] space-x-2 select-none pointer-events-none ${globalBoardBgColor === '#ffffff' ? 'text-gray-400' : 'text-white/20'}`}>
                      <span>滚轮缩放</span>·<span>Alt+拖拽平移</span>·<span>拖拽移动</span>·<span>Ctrl多选</span>·<span>Ctrl+V粘贴</span>
                    </div>

                    {/* Upload Button (floating top-left area) */}
                    <div className="absolute top-14 left-2.5 z-30">
                      <label className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-emerald-600/20 cursor-pointer transition-all">
                        <Upload className="w-3.5 h-3.5" /> 上传图片
                        <input type="file" className="hidden" accept="image/*" multiple onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          for (const file of files) {
                            await handleAddReference(file, 'image-ref');
                            const allRefs = await db.references.where('projectId').equals(selectedProject?.id || 0).toArray();
                            const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
                            const merged = [...allRefs, ...sfxRefs];
                            setCreativePanelRefs(merged);
                            await positionGlobalNewImage(file.name, merged);
                          }
                          e.target.value = '';
                        }} />
                      </label>
                    </div>

                    {/* ===== Canvas ===== */}
                    <div
                      ref={globalBoardContainerRef}
                      className="w-full h-full overflow-hidden relative select-none"
                      style={{ cursor: isGlobalBoardPanning ? 'grabbing' : globalDraggingId ? 'grabbing' : 'default' }}
                      onWheel={handleGlobalBoardWheel}
                      onMouseDown={handleGlobalBoardMouseDown}
                      onMouseMove={handleGlobalBoardMouseMove}
                      onMouseUp={handleGlobalBoardMouseUp}
                      onMouseLeave={handleGlobalBoardMouseUp}
                      onPaste={handleGlobalBoardPaste}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                      onDrop={handleGlobalBoardDrop}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if ((e.key === 'Delete' || e.key === 'Backspace') && globalSelectedIds.size > 0) {
                          handleGlobalDeleteSelected();
                        }
                      }}
                    >
                      {/* Grid Background */}
                      <div className="absolute inset-0" style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
                        backgroundSize: `${24 * globalBoardZoom}px ${24 * globalBoardZoom}px`,
                        backgroundPosition: `${globalBoardPan.x}px ${globalBoardPan.y}px`,
                      }} />

                      {/* Images Layer */}
                      <div className="absolute origin-top-left" style={{
                        transform: `translate(${globalBoardPan.x}px, ${globalBoardPan.y}px) scale(${globalBoardZoom})`,
                        width: '8000px', height: '8000px',
                      }}>
                        {creativePanelRefs.filter(r => r.category === 'image-ref' && r.type === 'image' && !r.shotId).map(ref => {
                          const pos = globalImgPositions[ref.id ?? 0];
                          const safePos = pos || { x: 60 + Math.random() * 40, y: 60 + Math.random() * 40, w: 260, h: 180 };
                          const isSelected = globalSelectedIds.has(ref.id!);
                          const isDragging = globalDraggingId === ref.id;
                          const isResizing = globalResizingId === ref.id;

                          return (
                            <div key={ref.id} className={`absolute group/img rounded overflow-hidden ${isDragging ? 'ring-1 ring-blue-500/60 z-50' : isSelected ? 'ring-1 ring-blue-400/50' : 'ring-1 ring-white/[0.06] hover:ring-white/[0.15]'}`}
                              style={{ left: safePos.x, top: safePos.y, width: safePos.w, height: safePos.h, backgroundColor: globalBoardBgColor === '#ffffff' ? '#f0f0f0' : '#222', cursor: isDragging ? 'grabbing' : isResizing ? 'nwse-resize' : 'grab', pointerEvents: 'auto' }}
                              onMouseDown={(e) => handleGlobalImgMouseDown(e, ref.id!)}
                            >
                              <img src={ref.url || ref.thumbnailUrl} alt={ref.name} className="w-full h-full object-contain pointer-events-none select-none" draggable={false} style={{ background: globalBoardBgColor === '#ffffff' ? '#f5f5f5' : '#2a2a2a' }} />
                              {(isSelected || isDragging) && <div className={`absolute top-0 left-0 w-3 h-3 ${isDragging ? 'bg-blue-500' : 'bg-blue-400/70'} rounded-br z-10`} />}
                              <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                <p className="text-[8px] font-medium text-white/80 truncate leading-tight">{ref.name}</p>
                              </div>
                              <div className={`absolute top-1 right-1 flex items-center gap-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'}`}>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteReference(ref.id!); setGlobalImgPositions(p => { const n = { ...p }; delete n[ref.id!]; return n; }); }}
                                  className="hover:bg-red-500/90 rounded flex items-center justify-center text-white/70 hover:text-white transition-colors" title="删除"
                                  style={{ width: 18, height: 18, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                              <div className="absolute bottom-0 right-0 w-4 h-4 opacity-0 group-hover/img:opacity-100 transition-opacity z-10"
                                onMouseDown={(e) => handleGlobalResizeMouseDown(e, ref.id!)}
                                style={{ cursor: 'nwse-resize', background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)', borderRadius: '0 0 0 4px' }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Empty State */}
                      {creativePanelRefs.filter(r => r.category === 'image-ref' && !r.shotId).length === 0 && (
                        <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none ${globalBoardBgColor === '#ffffff' ? 'text-gray-400' : 'text-gray-500'}`}>
                          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border border-dashed ${globalBoardBgColor === '#ffffff' ? 'bg-gray-100 border-gray-300' : 'bg-white/[0.04] border-white/10'}`}>
                            <Image className={`w-7 h-7 ${globalBoardBgColor === '#ffffff' ? 'opacity-30' : 'opacity-25'}`} />
                          </div>
                          <p className="text-xs font-medium">拖放图片到画布，或 Ctrl+V 粘贴</p>
                          <p className={`text-[9px] mt-1 ${globalBoardBgColor === '#ffffff' ? 'text-gray-400' : 'text-gray-600'}`}>支持批量拖放 · 滚轮缩放 · Alt+拖拽平移</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ===== 其他 Tab：保持原有网格布局 ===== */
                  <>
                {/* Upload Zone */}
                <div className="px-6 pt-4">
                  <label 
                    className="flex items-center justify-center gap-3 py-6 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
                  >
                    <input
                      type="file"
                      className="hidden"
                      accept={
                        creativeModalTab === 'asset-lib'
                          ? 'image/*,.psd,.ai,.svg'
                          : (creativeModalTab === 'video-ref'
                            ? 'video/*,audio/*'
                            : 'audio/*,video/*')
                      }
                      multiple
                      onChange={async (e) => {
                        try {
                          const files = Array.from(e.target.files || []);
                          for (const file of files) {
                            // 视频→音乐/音效tab时，弹出选择：提取音频 or 导入视频预览
                            if (file.type.startsWith('video/') && (creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib')) {
                              const choice = confirm(`"${file.name}" 是视频文件\n\n确定 = 提取音频导入\n取消 = 作为视频预览导入`);
                              if (choice) {
                                // 提取音频
                                const result = await extractAudioFromVideo(file);
                                if (result && result.dataUrl) {
                                  await db.references.add({
                                    projectId: selectedProject?.id,
                                    shotId: undefined,
                                    type: 'audio',
                                    category: creativeModalTab as Reference['category'],
                                    url: result.dataUrl,
                                    name: file.name.replace(/\.[^.]+$/, '.wav'),
                                    notes: `提取自视频`,
                                    createdAt: new Date(),
                                  });
                                } else {
                                  alert('音频提取失败，请重试');
                                  continue;
                                }
                              } else {
                                // 导入为视频（存到 video-ref）
                                await handleAddReference(file, 'video-ref');
                              }
                              continue;
                            }
                            await handleAddReference(file, creativeModalTab);
                          }
                          e.target.value = '';
                          // 刷新列表
                          if (selectedProject?.id) {
                            const projRefs = await db.references.where('projectId').equals(selectedProject.id).toArray();
                            const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
                            setCreativePanelRefs([...projRefs, ...sfxRefs]);
                          } else {
                            const allSfx = await db.references.where('category').equals('sfx-lib').toArray();
                            setCreativePanelRefs(allSfx);
                          }
                        } catch (err) {
                          console.error('Upload error:', err);
                          alert('上传出错: ' + (err instanceof Error ? err.message : String(err)));
                        }
                      }}
                    />
                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-blue-600/20 transition-all">
                      <Upload className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">
                        拖放或点击上传 {
                          creativeModalTab === 'video-ref' ? '视频/音频' :
                          creativeModalTab === 'music-ref' ? '音乐/音频/视频' :
                          creativeModalTab === 'sfx-lib' ? '音效/音频/视频' : '资产'
                        }
                      </p>
                      <p className="text-[9px] text-gray-600 mt-0.5">{(creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') ? '视频可提取音频 · 支持批量上传' : '支持批量上传'}</p>
                    </div>
                  </label>
                </div>

                {/* Reference Grid */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  {(() => {
                    const filteredRefs = creativePanelRefs.filter(r => r.category === creativeModalTab);

                    if (filteredRefs.length === 0) {
                      return (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 py-16">
                          <div className="w-20 h-20 bg-white/3 rounded-full flex items-center justify-center">
                            {creativeModalTab === 'video-ref' && <FilmIcon className="w-10 h-10 opacity-20" />}
                            {creativeModalTab === 'music-ref' && <Music className="w-10 h-10 opacity-20" />}
                            {creativeModalTab === 'sfx-lib' && <Volume2 className="w-10 h-10 opacity-20" />}
                            {creativeModalTab === 'asset-lib' && <FolderOpen className="w-10 h-10 opacity-20" />}
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium">暂无参考素材</p>
                            <p className="text-[10px] text-gray-600 mt-1">上传素材后将在此显示</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredRefs.map(ref => (
                          <motion.div
                            key={ref.id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="group/card bg-white/3 rounded-2xl overflow-hidden border border-white/5 hover:border-white/20 hover:shadow-lg hover:shadow-white/5 transition-all relative cursor-pointer"
                            onClick={() => setVideoPreviewUrl(ref.url)}
                          >
                            {/* Content Area */}
                            <div className={`overflow-hidden relative ${(creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') ? 'h-[120px]' : 'aspect-video'} bg-black/50`}>
                              {creativeModalTab === 'video-ref' ? (
                                <>
                                  {/* 默认静帧缩略图，悬停时自动播放预览 */}
                                  <div className="w-full h-full absolute inset-0 group-hover/card:opacity-0 transition-opacity duration-200">
                                    <video src={ref.url} muted playsInline className="w-full h-full object-cover pointer-events-none" />
                                  </div>
                                  <video
                                    className="w-full h-full object-cover opacity-0 group-hover/card:opacity-100 transition-opacity duration-200"
                                    src={ref.url}
                                    autoPlay muted loop playsInline
                                    onMouseEnter={(e) => {(e.target as HTMLVideoElement).play().catch(() => {});}}
                                  />
                                </>
                              ) : (creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') ? (
                                /* 音频波形图 */
                                <div className="w-full h-full flex flex-col p-3 gap-2" onClick={() => toggleAudioPlay(ref.id!, ref.url)}>
                                  {/* 波形图 Canvas */}
                                  <div className="flex-1 cursor-pointer rounded-lg overflow-hidden"
                                    onMouseDown={(e) => handleWaveformSeek(e, ref.id!)}
                                  >
                                    <WaveformCanvas
                                      waveformData={waveformCache[ref.id!] || null}
                                      progress={audioProgressMap[ref.id!] || 0}
                                      color={creativeModalTab === 'music-ref' ? '#a855f7' : '#f97316'}
                                      height={52}
                                    />
                                    {/* 首次加载波形 */}
                                    {!waveformCache[ref.id!] && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); loadWaveform(ref.id!, ref.url); }}
                                        className="absolute inset-0 m-auto w-6 h-6 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"
                                        title="加载波形"
                                      >
                                        <AudioWaveform className="w-3 h-3 text-white/60" />
                                      </button>
                                    )}
                                  </div>
                                  {/* 播放控制条 */}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleAudioPlay(ref.id!, ref.url); }}
                                      className="w-6 h-6 rounded-md flex items-center justify-center bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-all"
                                    >
                                      {audioPlayingRefId === ref.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-px" />}
                                    </button>
                                    <span className="flex-1 text-[8px] font-mono text-gray-500 truncate">{ref.name}</span>
                                  </div>
                                </div>
                              ) : creativeModalTab === 'asset-lib' ? (
                                ref.url && <img src={ref.url} alt={ref.name} className="w-full h-full object-cover" draggable={false} onClick={() => setVideoPreviewUrl(ref.url)} />
                              ) : null}
                              {/* Hover Overlay (video / image) — 透明不遮挡画面 */}
                              {(creativeModalTab === 'video-ref' || creativeModalTab === 'asset-lib') && (
                                <div className="absolute inset-0 bg-transparent opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-end gap-2 p-2">
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteReference(ref.id!); }} className="p-2 bg-black/40 backdrop-blur-sm rounded-lg text-white/70 hover:text-white hover:bg-red-500/60 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              )}
                              {/* 删除按钮（音频卡片） */}
                              {(creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteReference(ref.id!); }}
                                  className="absolute top-1.5 right-1.5 p-1 bg-white/5 hover:bg-red-500/30 rounded-md opacity-0 group-hover/card:opacity-100 transition-all z-10"
                                >
                                  <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
                                </button>
                              )}
                              {/* Type Badge */}
                              <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[7px] font-bold text-white/70 uppercase tracking-wider">
                                {creativeModalTab === 'video-ref' ? 'VIDEO' : creativeModalTab === 'music-ref' ? 'AUDIO' : creativeModalTab === 'sfx-lib' ? 'SFX' : 'IMG'}
                              </div>
                            </div>
                            {/* Info */}
                            {(creativeModalTab === 'video-ref' || creativeModalTab === 'asset-lib') && (
                              <div className="p-3">
                                <p className="text-[10px] font-bold text-white truncate">{ref.name}</p>
                                <p className="text-[8px] text-gray-600 mt-0.5">{format(ref.createdAt, 'MM-dd HH:mm')}</p>
                                {ref.notes && <p className="text-[9px] text-gray-500 mt-1 line-clamp-2">{ref.notes}</p>}
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                  </>
                )}

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/2">
                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                    <Info className="w-3 h-3" />
                    <span>已收集 {creativePanelRefs.length} 个参考素材</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => { setIsCreativePanelModal(false); setCreativeActiveTab(null); }}
                      className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition-all"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      


      {/* Stage Picker Dialog - 选择制作阶段导入 */}
      <AnimatePresence>
        {isStagePickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setIsStagePickerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[#16161a] rounded-2xl border border-white/10 shadow-2xl w-full max-w-md p-6 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-amber-400/10 rounded-xl flex items-center justify-center text-amber-400">
                  <Clapperboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">选择导入来源</h3>
                  <p className="text-[10px] text-gray-500 font-medium">选择要串片的制作阶段版本</p>
                </div>
              </div>

              {/* Stage Options - 常用视频阶段优先展示 */}
              <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-2.5">推荐 · 视频输出阶段</p>

              <div className="grid grid-cols-3 gap-2.5 mb-4">
                {[
                  {
                    stage: 'Animation',
                    label: '动画',
                    icon: Activity,
                    desc: '最新动画版',
                    color: 'from-blue-500/15 to-blue-500/5',
                    borderColor: 'border-blue-500/20',
                    textColor: 'text-blue-400',
                  },
                  {
                    stage: 'Previs',
                    label: '预演',
                    icon: FileVideo,
                    desc: '最新预演版',
                    color: 'from-purple-500/15 to-purple-500/5',
                    borderColor: 'border-purple-500/20',
                    textColor: 'text-purple-400',
                  },
                  {
                    stage: 'Comp',
                    label: '合成',
                    icon: Layers,
                    desc: '最终合成版',
                    color: 'from-emerald-500/15 to-emerald-500/5',
                    borderColor: 'border-emerald-500/20',
                    textColor: 'text-emerald-400',
                  },
                ].map(opt => (
                  <button
                    key={opt.stage}
                    onClick={() => { setIsStagePickerOpen(false); loadStringoutVersions(opt.stage); setIsStringoutModal(true); }}
                    className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] ${opt.color} ${opt.borderColor} ${opt.textColor}`}
                  >
                    <opt.icon className="w-4 h-4 mb-1" />
                    <p className="text-[11px] font-bold">{opt.label}</p>
                    <p className="text-[8px] opacity-60">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* All Stages */}
              <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-2.5">全部制作阶段</p>
              <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto custom-scrollbar">
                {DEFAULT_STAGES.map(stage => {
                  const isVideoStage = ['Animation','Previs','Comp','FX','Lighting'].includes(stage);
                  const Icon = isVideoStage ? FilmIcon : (stage === 'Creative' ? Sparkles : (stage === 'Asset' ? FolderSync : (stage === 'Storyboard' ? Clapperboard : Lightbulb)));
                  return (
                    <button
                      key={stage}
                      onClick={() => { setIsStagePickerOpen(false); loadStringoutVersions(stage); setIsStringoutModal(true); }}
                      className={`px-2.5 py-2 rounded-lg border text-left transition-all hover:scale-[1.02] ${
                        isVideoStage
                          ? 'border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-blue-500/30'
                          : 'border-white/[0.03] bg-white/[0.01] opacity-35 cursor-not-allowed'
                      }`}
                      title={`${STAGE_LABELS[stage] || stage}${!isVideoStage ? '（通常无视频输出）' : ''}`}
                    >
                      <Icon className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-[9px] font-medium text-gray-500">{STAGE_LABELS[stage] || stage}</span>
                    </button>
                  );
                })}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <button
                  onClick={() => { setIsStagePickerOpen(false); loadStringoutVersions(); setIsStringoutModal(true); }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
                >
                  加载全部最新版本 →
                </button>
                <button
                  onClick={() => setIsStagePickerOpen(false)}
                  className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-[10px] font-bold transition-all"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* String-out / Editorial Modal */}
      <AnimatePresence>
        {isStringoutModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-brand-bg/90 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => { setIsStringoutModal(false); setCreativeActiveTab(null); setIsStringoutPlaying(false); }}
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-panel rounded-[2.5rem] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border-white/10 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* String-out Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-amber-400/10 rounded-2xl flex items-center justify-center text-amber-400">
                    <Clapperboard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-tight">串片 / 剪辑</h3>
                    <p className="text-[10px] text-gray-500 font-medium">按制作阶段浏览版本，快速顺序播放对比</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-2.5 py-1 rounded-lg">{stringoutVersions.length} 个版本</span>
                  <button 
                    onClick={() => { setIsStringoutModal(false); setCreativeActiveTab(null); setIsStringoutPlaying(false); }}
                    className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* String-out Body */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left: Clip List / Timeline */}
                <div className="w-80 border-r border-white/5 flex flex-col bg-black/20">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">镜头序列 ({stringoutVersions.length})</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => { if (stringoutVersions.length > 0) { setIsStringoutPlaying(true); setStringoutCurrentIdx(0); } }}
                        className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-all" title="顺序播放"
                      ><Play className="w-3.5 h-3.5" /></button>
                      <button 
                        onClick={() => setIsStringoutPlaying(false)}
                        className="p-1.5 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-all" title="停止"
                      ><Pause className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {stringoutVersions.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-600 py-12">
                        <Clapperboard className="w-8 h-8 opacity-20 mb-3" />
                        <p className="text-xs font-medium">暂无串片版本</p>
                        <p className="text-[10px] mt-1">请先选择导入来源</p>
                      </div>
                    ) : (
                      stringoutVersions.map((v, idx) => (
                        <motion.div
                          key={v.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => { setStringoutCurrentIdx(idx); }}
                          className={`p-3 rounded-xl border cursor-pointer transition-all group ${
                            stringoutCurrentIdx === idx 
                              ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5' 
                              : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-mono font-bold text-amber-400">#{idx + 1}</span>
                            <span className="text-[9px] font-mono text-gray-600">{v.stageName}</span>
                          </div>
                          <p className="text-xs font-bold text-white truncate mb-0.5">{v.name}</p>
                          {v.notes && <p className="text-[9px] text-gray-500 line-clamp-1">{v.notes}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[8px] text-gray-600">V{String(v.versionNumber).padStart(3,'0')}</span>
                            {v.duration && <span className="text-[8px] text-gray-600">{v.duration.toFixed(1)}s</span>}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right: Video Player */}
                <div className="flex-1 flex flex-col bg-black/40">
                  {stringoutVersions.length > 0 && stringoutCurrentIdx >= 0 ? (
                    <>
                      <div className="flex-1 relative flex items-center justify-center p-6">
                        <video
                          ref={stringoutVideoRef}
                          src={stringoutVersions[stringoutCurrentIdx].videoBlob ? URL.createObjectURL(stringoutVersions[stringoutCurrentIdx].videoBlob) : stringoutVersions[stringoutCurrentIdx].videoUrl}
                          playsInline
                          className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                          onEnded={() => {
                            if (stringoutCurrentIdx < stringoutVersions.length - 1) {
                              setStringoutCurrentIdx(prev => prev + 1);
                            } else {
                              setIsStringoutPlaying(false);
                            }
                          }}
                        />
                        <div className="absolute top-4 left-4 px-3 py-1.5 bg-amber-500/80 backdrop-blur-sm rounded-lg text-[10px] font-black text-white">
                          #{stringoutCurrentIdx + 1} / {stringoutVersions.length} · {stringoutVersions[stringoutCurrentIdx]?.name}
                        </div>
                      </div>
                      {/* Transport Controls */}
                      <div className="shrink-0 p-4 border-t border-white/5 bg-zinc-950/60">
                        <div className="flex items-center gap-4 max-w-2xl mx-auto">
                          <button 
                            onClick={() => setStringoutCurrentIdx(Math.max(0, stringoutCurrentIdx - 1))}
                            disabled={stringoutCurrentIdx === 0}
                            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white disabled:opacity-20 transition-all"
                          ><SkipBack className="w-4 h-4" /></button>
                          <button
                            onClick={() => { if (stringoutVideoRef.current) { if (isStringoutPlaying) { stringoutVideoRef.current.pause(); setIsStringoutPlaying(false); } else { stringoutVideoRef.current.play().catch(() => {}); setIsStringoutPlaying(true); } } }}
                            className="w-11 h-11 bg-amber-500 text-zinc-900 rounded-full flex items-center justify-center hover:bg-amber-400 transition-all shadow-lg"
                          >{isStringoutPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}</button>
                          <button 
                            onClick={() => setStringoutCurrentIdx(Math.min(stringoutVersions.length - 1, stringoutCurrentIdx + 1))}
                            disabled={stringoutCurrentIdx === stringoutVersions.length - 1}
                            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white disabled:opacity-20 transition-all"
                          ><SkipForward className="w-4 h-4" /></button>
                          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${((stringoutCurrentIdx + 1) / stringoutVersions.length) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-gray-500">{stringoutCurrentIdx + 1}/{stringoutVersions.length}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600">
                      <Clapperboard className="w-16 h-16 opacity-15 mb-4" />
                      <p className="text-sm font-medium">选择导入来源开始串片</p>
                      <p className="text-[10px] mt-1 text-gray-600">从上方选择制作阶段或加载全部版本</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Creative Panel Modal (图片参考/视频参考/音乐/音效/资产库) */}
      <AnimatePresence>
        {isCreativePanelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[155] bg-brand-bg/95 backdrop-blur-xl flex items-center justify-center p-6"
            onClick={() => { setIsCreativePanelModal(false); setCreativeActiveTab(null); }}
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-panel rounded-[2.5rem] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden border-white/10 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    creativeModalTab === 'image-ref' ? 'bg-emerald-400/10 text-emerald-400' :
                    creativeModalTab === 'video-ref' ? 'bg-blue-400/10 text-blue-400' :
                    creativeModalTab === 'music-ref' ? 'bg-pink-400/10 text-pink-400' :
                    creativeModalTab === 'sfx-lib' ? 'bg-orange-400/10 text-orange-400' :
                    'bg-cyan-400/10 text-cyan-400'
                  }`}>
                    {creativeModalTab === 'image-ref' && <Image className="w-5 h-5" />}
                    {creativeModalTab === 'video-ref' && <FilmIcon className="w-5 h-5" />}
                    {creativeModalTab === 'music-ref' && <Music className="w-5 h-5" />}
                    {creativeModalTab === 'sfx-lib' && <Volume2 className="w-5 h-5" />}
                    {creativeModalTab === 'asset-lib' && <FolderOpen className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-tight">
                      {creativeModalTab === 'image-ref' ? '图片参考' :
                       creativeModalTab === 'video-ref' ? '视频参考' :
                       creativeModalTab === 'music-ref' ? '音乐参考' :
                       creativeModalTab === 'sfx-lib' ? '音效库' : '资产库'}
                    </h3>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {creativeModalTab === 'image-ref' ? '收集和管理项目视觉参考素材' :
                       creativeModalTab === 'video-ref' ? '收集和管理项目动态参考素材' :
                       creativeModalTab === 'music-ref' ? '收集和管理音乐参考素材' :
                       creativeModalTab === 'sfx-lib' ? '收集和管理音效素材' : '管理项目资产文件'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Tab Switcher */}
                  <div className="flex bg-white/5 rounded-xl p-1 gap-0.5 mr-3">
                    {[
                      { id: 'image-ref', icon: Image, color: 'text-emerald-400' },
                      { id: 'video-ref', icon: FilmIcon, color: 'text-blue-400' },
                      { id: 'music-ref', icon: Music, color: 'text-pink-400' },
                      { id: 'sfx-lib', icon: Volume2, color: 'text-orange-400' },
                      { id: 'asset-lib', icon: FolderOpen, color: 'text-cyan-400' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setCreativeModalTab(tab.id)}
                        className={`p-2 rounded-lg transition-all ${
                          creativeModalTab === tab.id ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                        title={tab.id}
                      >
                        <tab.icon className={`w-3.5 h-3.5 ${creativeModalTab === tab.id ? tab.color : 'text-gray-500'}`} />
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => { setIsCreativePanelModal(false); setCreativeActiveTab(null); }}
                    className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {creativeModalTab === 'image-ref' ? (
                  /* ===== 图片参考：PureRef2 风格画布板 ===== */
                  <div className="flex-1 relative rounded-2xl overflow-hidden m-1" style={{ backgroundColor: globalBoardBgColor }}>
                    {/* Toolbar (top-right) */}
                    <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-xl px-2 py-1.5 border border-white/[0.08]">
                      <button onClick={() => setGlobalBoardZoom(prev => Math.min(5, prev * 1.15))} className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="放大"><ZoomIn className="w-3.5 h-3.5" /></button>
                      <span className="px-1 text-[9px] font-mono text-white/40 min-w-[36px] text-center">{Math.round(globalBoardZoom * 100)}%</span>
                      <button onClick={() => setGlobalBoardZoom(prev => Math.max(0.1, prev / 1.15))} className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="缩小"><ZoomOut className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <button onClick={() => { setGlobalBoardZoom(1); setGlobalBoardPan({ x: 60, y: 40 }); }} className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="重置视图"><Move className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <div className="flex items-center gap-1.5">
                        {[
                          { c: '#ffffff', n: '白色' }, { c: '#2a2a2a', n: '深灰' }, { c: '#1e1e1e', n: '黑色' },
                        ].map(bg => (
                          <button key={bg.c} onClick={() => setGlobalBoardBgColor(bg.c)} className={`w-7 h-7 rounded-lg border-2 transition-all duration-150 ${globalBoardBgColor === bg.c ? 'border-white/80 scale-105 shadow-lg shadow-black/30' : 'border-white/15 hover:border-white/35 hover:scale-105'}`} style={{ backgroundColor: bg.c }} title={bg.n} />
                        ))}
                      </div>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <label className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer" title="导入 .pur 文件"><FolderOpen className="w-3.5 h-3.5" /><input type="file" className="hidden" accept=".pur" onChange={handleImportPur} /></label>
                      <button onClick={handleExportPur} className="w-6 h-6 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors" title="导出为 .pur"><Download className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <button onClick={handleGlobalDeleteSelected} disabled={globalSelectedIds.size === 0} className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${globalSelectedIds.size > 0 ? 'text-red-400 hover:text-red-300 hover:bg-red-500/15' : 'text-white/20 cursor-not-allowed'}`} title="删除选中"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>

                    {/* Label (top-left) */}
                    <div className="absolute top-2.5 left-2.5 z-30 flex items-center gap-2">
                      <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-sm border ${globalBoardBgColor === '#ffffff' ? 'bg-black/8 border-black/10' : 'bg-white/[0.06] border-white/[0.08]'}`}>
                        <Image className={`w-3 h-3 ${globalBoardBgColor === '#ffffff' ? 'text-gray-500' : 'text-white/45'}`} />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${globalBoardBgColor === '#ffffff' ? 'text-gray-600' : 'text-white/45'}`}>图片参考 · {creativePanelRefs.filter(r => r.category === 'image-ref' && !r.shotId).length}张{globalSelectedIds.size > 0 && ` · ${globalSelectedIds.size}已选`}</span>
                      </div>
                    </div>

                    {/* Hints (bottom-left) */}
                    <div className={`absolute bottom-2 left-2.5 z-30 text-[8px] space-x-2 select-none pointer-events-none ${globalBoardBgColor === '#ffffff' ? 'text-gray-400' : 'text-white/20'}`}>
                      <span>滚轮缩放</span>·<span>Alt+拖拽平移</span>·<span>拖拽移动</span>·<span>Ctrl多选</span>·<span>Ctrl+V粘贴</span>
                    </div>

                    {/* Upload Button (floating top-left area) */}
                    <div className="absolute top-14 left-2.5 z-30">
                      <label className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-emerald-600/20 cursor-pointer transition-all">
                        <Upload className="w-3.5 h-3.5" /> 上传图片
                        <input type="file" className="hidden" accept="image/*" multiple onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          for (const file of files) {
                            await handleAddReference(file, 'image-ref');
                            const allRefs = await db.references.where('projectId').equals(selectedProject?.id || 0).toArray();
                            const sfxRefs = await db.references.where('category').equals('sfx-lib').toArray();
                            const merged = [...allRefs, ...sfxRefs];
                            setCreativePanelRefs(merged);
                            await positionGlobalNewImage(file.name, merged);
                          }
                          e.target.value = '';
                        }} />
                      </label>
                    </div>

                    {/* Canvas */}
                    <div
                      ref={globalBoardContainerRef}
                      className="w-full h-full overflow-hidden relative select-none"
                      style={{ cursor: isGlobalBoardPanning ? 'grabbing' : globalDraggingId ? 'grabbing' : 'default' }}
                      onWheel={handleGlobalBoardWheel}
                      onMouseDown={handleGlobalBoardMouseDown}
                      onMouseMove={handleGlobalBoardMouseMove}
                      onMouseUp={handleGlobalBoardMouseUp}
                      onMouseLeave={handleGlobalBoardMouseUp}
                      onPaste={handleGlobalBoardPaste}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                      onDrop={handleGlobalBoardDrop}
                      tabIndex={0}
                      onKeyDown={(e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && globalSelectedIds.size > 0) handleGlobalDeleteSelected(); }}
                    >
                      {/* Grid Background */}
                      <div className="absolute inset-0" style={{
                        backgroundImage: globalBoardBgColor === '#ffffff' 
                          ? 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)'
                          : 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
                        backgroundSize: `${24 * globalBoardZoom}px ${24 * globalBoardZoom}px`,
                        backgroundPosition: `${globalBoardPan.x}px ${globalBoardPan.y}px`,
                        transform: `translate(${globalBoardPan.x}px, ${globalBoardPan.y}px) scale(${globalBoardZoom})`,
                        transformOrigin: '0 0',
                      }} />

                      {/* Images */}
                      {creativePanelRefs.filter(r => r.category === 'image-ref' && !r.shotId).map(ref => (
                        <motion.div
                          key={ref.id}
                          layout
                          drag
                          dragMomentum={false}
                          onDragStart={() => { if (!globalSelectedIds.has(ref.id!)) setGlobalSelectedIds(new Set([ref.id!])); else { const s = new Set(globalSelectedIds); s.add(ref.id!); setGlobalSelectedIds(s); } setIsGlobalBoardPanning(false); setGlobalDraggingId(ref.id!); }}
                          onDragEnd={() => setGlobalDraggingId(null)}
                          onMouseDown={(e) => { if (e.ctrlKey || e.metaKey) { e.stopPropagation(); const s = new Set(globalSelectedIds); if (s.has(ref.id!)) s.delete(ref.id!); else s.add(ref.id!); setGlobalSelectedIds(s); } }}
                          onDoubleClick={() => handleGlobalEditNote(ref)}
                          className="absolute cursor-grab active:cursor-grabbing"
                          style={{
                            left: ref.boardX ?? 100,
                            top: ref.boardY ?? 100,
                            width: (ref.boardW ?? 250) * globalBoardZoom,
                            height: (ref.boardH ?? 180) * globalBoardZoom,
                            outline: globalSelectedIds.has(ref.id!) ? '2px solid #3b82f6' : 'none',
                            outlineOffset: '2px',
                            zIndex: globalSelectedIds.has(ref.id!) ? 50 : (globalDraggingId === ref.id ? 40 : 10),
                          }}
                        >
                          <img src={ref.url} alt={ref.name} draggable={false} className="w-full h-full object-contain pointer-events-none rounded-lg shadow-xl" style={{ filter: `brightness(${ref.brightness ?? 100}%) contrast(${ref.contrast ?? 100}%)` }} />
                          {ref.notes && (
                            <div className={`absolute bottom-0 left-0 right-0 px-2 py-1 text-[9px] font-medium truncate ${globalBoardBgColor === '#ffffff' ? 'bg-black/60 text-white' : 'bg-black/70 text-white/80'}`}>
                              {ref.notes}
                            </div>
                          )}
                        </motion.div>
                      ))}

                      {/* Selection Box */}
                      {(globalSelectionBox.start.x !== null) && (
                        <div className="absolute bg-blue-500/15 border border-blue-500/40 pointer-events-none z-9999" style={{
                          left: Math.min(globalSelectionBox.start.x, globalSelectionBox.end.x),
                          top: Math.min(globalSelectionBox.start.y, globalSelectionBox.end.y),
                          width: Math.abs(globalSelectionBox.end.x - globalSelectionBox.start.x),
                          height: Math.abs(globalSelectionBox.end.y - globalSelectionBox.start.y),
                        }} />
                      )}

                      {/* Empty State */}
                      {creativePanelRefs.filter(r => r.category === 'image-ref' && !r.shotId).length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className={`${globalBoardBgColor === '#ffffff' ? 'text-gray-400' : 'text-white/15'} text-center`}>
                            <Image className="w-12 h-12 mx-auto mb-2 opacity-40" />
                            <p className="text-xs font-medium">拖拽或粘贴图片到画布</p>
                            <p className={`text-[10px] mt-1 ${globalBoardBgColor === '#ffffff' ? 'text-gray-500' : 'text-white/20'}`}>支持 PNG/JPG/WebP</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ===== 其他 Tab：保持原有网格布局 ===== */
                  <>
                    {/* Upload Zone */}
                    <div className="px-6 pt-4">
                      <label className="flex items-center justify-center gap-3 py-6 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group">
                        <input type="file" className="hidden" accept={
                          creativeModalTab === 'asset-lib' ? 'image/*,.psd,.ai,.svg' :
                          (creativeModalTab === 'video-ref' ? 'video/*,audio/*' : 'audio/*,video/*')
                        } multiple onChange={async (e) => {
                          try {
                            const files = Array.from(e.target.files || []);
                            for (const file of files) {
                              if (file.type.startsWith('video/') && (creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib')) {
                                const choice = confirm(`"${file.name}" 是视频文件\n\n确定 = 提取音频导入\n取消 = 作为视频预览导入`);
                                if (choice) {
                                  const result = await extractAudioFromVideo(file);
                                  if (result && result.dataUrl) {
                                    await db.references.add({ projectId: selectedProject?.id, type: 'audio', category: creativeModalTab as Reference['category'], url: result.dataUrl, name: file.name.replace(/\.[^.]+$/, '.wav'), notes: `提取自视频`, createdAt: new Date() });
                                  } else { alert('音频提取失败'); continue; }
                                } else { await handleAddReference(file, 'video-ref'); }
                                continue;
                              }
                              await handleAddReference(file, creativeModalTab);
                            }
                            e.target.value = '';
                            // refresh
                            if (selectedProject?.id) {
                              const projRefs2 = await db.references.where('projectId').equals(selectedProject.id).toArray();
                              const sfxRefs2 = await db.references.where('category').equals('sfx-lib').toArray();
                              setCreativePanelRefs([...projRefs2, ...sfxRefs2]);
                            } else {
                              const allSfx2 = await db.references.where('category').equals('sfx-lib').toArray();
                              setCreativePanelRefs(allSfx2);
                            }
                          } catch (err) {
                            console.error('Upload error:', err);
                            alert('上传出错: ' + (err instanceof Error ? err.message : String(err)));
                          }
                        }} />
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-blue-600/20 transition-all">
                          <Upload className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">
                            拖放或点击上传 {creativeModalTab === 'video-ref' ? '视频/音频' : creativeModalTab === 'music-ref' ? '音乐/音频/视频' : creativeModalTab === 'sfx-lib' ? '音效/音频/视频' : '资产'}
                          </p>
                          <p className="text-[9px] text-gray-600 mt-0.5">{(creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') ? '视频可提取音频 · 支持批量上传' : '支持批量上传'}</p>
                        </div>
                      </label>
                    </div>

                    {/* Reference Grid */}
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                      {(() => {
                        const filteredRefs = creativePanelRefs.filter(r => r.category === creativeModalTab);
                        if (filteredRefs.length === 0) {
                          return (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 py-16">
                              <div className="w-20 h-20 bg-white/3 rounded-full flex items-center justify-center">
                                {creativeModalTab === 'video-ref' && <FilmIcon className="w-10 h-10 opacity-20" />}
                                {creativeModalTab === 'music-ref' && <Music className="w-10 h-10 opacity-20" />}
                                {creativeModalTab === 'sfx-lib' && <Volume2 className="w-10 h-10 opacity-20" />}
                                {creativeModalTab === 'asset-lib' && <FolderOpen className="w-10 h-10 opacity-20" />}
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-medium">暂无参考素材</p>
                                <p className="text-[10px] text-gray-600 mt-1">上传素材后将在此显示</p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {filteredRefs.map(ref => (
                              <motion.div key={ref.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                className="group/card bg-white/3 rounded-2xl overflow-hidden border border-white/5 hover:border-white/20 hover:shadow-lg hover:shadow-white/5 transition-all relative cursor-pointer"
                                onClick={() => setVideoPreviewUrl(ref.url)}
                              >
                                <div className={`overflow-hidden relative ${(creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') ? 'h-[120px]' : 'aspect-video'} bg-black/50`}>
                                  {creativeModalTab === 'video-ref' ? (
                                    <>
                                      {/* 默认静帧缩略图，悬停时自动播放预览 */}
                                      <div className="w-full h-full absolute inset-0 group-hover/card:opacity-0 transition-opacity duration-200">
                                        <video src={ref.url} muted playsInline className="w-full h-full object-cover pointer-events-none" />
                                      </div>
                                      <video
                                        className="w-full h-full object-cover opacity-0 group-hover/card:opacity-100 transition-opacity duration-200"
                                        src={ref.url}
                                        autoPlay muted loop playsInline
                                        onMouseEnter={(e) => {(e.target as HTMLVideoElement).play().catch(() => {});}}
                                      />
                                    </>
                                  ) : (creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') ? (
                                    <div className="w-full h-full flex flex-col p-3 gap-2" onClick={() => toggleAudioPlay(ref.id!, ref.url)}>
                                      <div className="flex-1 cursor-pointer rounded-lg overflow-hidden" onMouseDown={(e) => handleWaveformSeek(e, ref.id!)}>
                                        <WaveformCanvas waveformData={waveformCache[ref.id!] || null} progress={audioProgressMap[ref.id!] || 0} color={creativeModalTab === 'music-ref' ? '#a855f7' : '#f97316'} height={52} />
                                        {!waveformCache[ref.id!] && (
                                          <button onClick={(e) => { e.stopPropagation(); loadWaveform(ref.id!, ref.url); }} className="absolute inset-0 m-auto w-6 h-6 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all" title="加载波形">
                                            <AudioWaveform className="w-3 h-3 text-white/60" />
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); toggleAudioPlay(ref.id!, ref.url); }} className="w-6 h-6 rounded-md flex items-center justify-center bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-all">
                                          {audioPlayingRefId === ref.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-px" />}
                                        </button>
                                        <span className="flex-1 text-[8px] font-mono text-gray-500 truncate">{ref.name}</span>
                                      </div>
                                    </div>
                                  ) : creativeModalTab === 'asset-lib' ? (
                                    ref.url && <img src={ref.url} alt={ref.name} className="w-full h-full object-cover" draggable={false} onClick={() => setVideoPreviewUrl(ref.url)} />
                                  ) : null}
                                  {/* Hover Overlay — 透明不遮挡画面 */}
                                  {(creativeModalTab === 'video-ref' || creativeModalTab === 'asset-lib') && (
                                    <div className="absolute inset-0 bg-transparent opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-end gap-2 p-2">
                                      <button onClick={(e) => { e.stopPropagation(); handleDeleteReference(ref.id!); }} className="p-2 bg-black/40 backdrop-blur-sm rounded-lg text-white/70 hover:text-white hover:bg-red-500/60 transition-all"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                  )}
                                  {/* Audio delete btn */}
                                  {(creativeModalTab === 'music-ref' || creativeModalTab === 'sfx-lib') && (
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteReference(ref.id!); }} className="absolute top-1.5 right-1.5 p-1 bg-white/5 hover:bg-red-500/30 rounded-md opacity-0 group-hover/card:opacity-100 transition-all z-10">
                                      <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
                                    </button>
                                  )}
                                  <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[7px] font-bold text-white/70 uppercase tracking-wider">
                                    {creativeModalTab === 'video-ref' ? 'VIDEO' : creativeModalTab === 'music-ref' ? 'AUDIO' : creativeModalTab === 'sfx-lib' ? 'SFX' : 'IMG'}
                                  </div>
                                </div>
                                {(creativeModalTab === 'video-ref' || creativeModalTab === 'asset-lib') && (
                                  <div className="p-3">
                                    <p className="text-[10px] font-bold text-white truncate">{ref.name}</p>
                                    <p className="text-[8px] text-gray-600 mt-0.5">{format(ref.createdAt, 'MM-dd HH:mm')}</p>
                                    {ref.notes && <p className="text-[9px] text-gray-500 mt-1 line-clamp-2">{ref.notes}</p>}
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <Info className="w-3 h-3" />
                  <span>已收集 {creativePanelRefs.length} 个参考素材</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setIsCreativePanelModal(false); setCreativeActiveTab(null); }} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition-all">关闭</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Video Reference Preview Modal - 视频参考放大播放（放在所有modal之后，确保z-[200]永远在最顶层） */}
{/* Video Reference Preview Modal - 视频参考放大播放 */}
      <AnimatePresence>
        {videoPreviewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex items-center justify-center"
            onClick={() => setVideoPreviewUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-[90vw] max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <video
                src={videoPreviewUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
              {/* Close button */}
              <button
                onClick={() => setVideoPreviewUrl(null)}
                className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-xl text-white/70 hover:text-white transition-all z-10"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
