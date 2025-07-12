<template>
  <div class="app">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-group">
        <button class="toolbar-button" @click="newFile" title="新建 (Ctrl+N)">📄</button>
        <button class="toolbar-button" @click="openFile" title="打开 (Ctrl+O)">📂</button>
        <button class="toolbar-button" @click="saveFile" title="保存 (Ctrl+S)">💾</button>
        <button class="toolbar-button" @click="saveAsFile" title="另存为 (Ctrl+Shift+S)">📋</button>
      </div>
      
      <div class="toolbar-group">
        <button class="toolbar-button" :disabled="loading" @click="call(undoCommand)" title="撤销 (Ctrl+Z)">↶</button>
        <button class="toolbar-button" :disabled="loading" @click="call(redoCommand)" title="重做 (Ctrl+Y)">↷</button>
      </div>
      
      <div class="toolbar-group">
        <button class="toolbar-button" :disabled="loading" @click="call(wrapInHeadingCommand, 1)" title="标题 1">H1</button>
        <button class="toolbar-button" :disabled="loading" @click="call(wrapInHeadingCommand, 2)" title="标题 2">H2</button>
        <button class="toolbar-button" :disabled="loading" @click="call(wrapInHeadingCommand, 3)" title="标题 3">H3</button>
      </div>
      
      <div class="toolbar-group">
        <button class="toolbar-button" :disabled="loading" @click="call(toggleStrongCommand)" title="粗体 (Ctrl+B)"><strong>B</strong></button>
        <button class="toolbar-button" :disabled="loading" @click="call(toggleEmphasisCommand)" title="斜体 (Ctrl+I)"><em>I</em></button>
        <button class="toolbar-button" :disabled="loading" @click="call(toggleInlineCodeCommand)" title="行内代码">&lt;/&gt;</button>
      </div>
      
      <div class="toolbar-group">
        <button class="toolbar-button" :disabled="loading" @click="insertLink" title="插入链接">🔗</button>
        <button class="toolbar-button" :disabled="loading" @click="insertImage" title="插入图片">🖼️</button>
        <!-- <button class="toolbar-button" :disabled="loading" @click="call(createTableCommand)" title="插入表格">📊</button> -->
      </div>
      
      <div class="toolbar-group">
        <button 
          class="toolbar-button" 
          @click="toggleDarkMode" 
          :title="isDarkMode ? '切换到浅色模式' : '切换到深色模式'"
        >
          {{ isDarkMode ? '☀️' : '🌙' }}
        </button>
        <button 
          class="toolbar-button" 
          @click="toggleSpellCheck" 
          :class="{ active: spellCheckEnabled }"
          title="拼写检查"
        >
          📝
        </button>
      </div>
      
      <div class="file-info">
        <div class="file-status">
          <span class="status-dot" :class="{ unsaved: hasUnsavedChanges }"></span>
          <span>{{ currentFile || '未命名文件' }}</span>
        </div>
        <div>
          字符数: {{ characterCount }} | 行数: {{ lineCount }}
        </div>
      </div>
    </div>
    
    <!-- 编辑器容器 -->
    <div class="editor-container">
      <div ref="editorContainerRef" class="milkdown-editor"></div>
    </div>
    
    <!-- 状态栏 -->
    <div class="status-bar">
      <div>
        <span v-if="loading">正在加载编辑器...</span>
        <span v-else>就绪</span>
      </div>
      <div>
        <span>Milkdown + Vue + Electron</span>
      </div>
    </div>

    <!-- 链接对话框 -->
    <div v-if="showLinkDialog" class="dialog-overlay" @click="showLinkDialog = false">
      <div class="dialog" @click.stop>
        <h3>插入链接</h3>
        <div class="dialog-field">
          <label>链接地址:</label>
          <input v-model="linkUrl" type="url" placeholder="https://" />
        </div>
        <div class="dialog-field">
          <label>链接文本:</label>
          <input v-model="linkText" type="text" placeholder="链接描述" />
        </div>
        <div class="dialog-actions">
          <button @click="showLinkDialog = false">取消</button>
          <button @click="confirmInsertLink" class="primary">确定</button>
        </div>
      </div>
    </div>

    <!-- 图片对话框 -->
    <div v-if="showImageDialog" class="dialog-overlay" @click="showImageDialog = false">
      <div class="dialog" @click.stop>
        <h3>插入图片</h3>
        <div class="dialog-field">
          <label>图片地址:</label>
          <input v-model="imageUrl" type="url" placeholder="https://" />
        </div>
        <div class="dialog-field">
          <label>图片描述:</label>
          <input v-model="imageAlt" type="text" placeholder="图片描述" />
        </div>
        <div class="dialog-actions">
          <button @click="showImageDialog = false">取消</button>
          <button @click="confirmInsertImage" class="primary">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, shallowRef } from 'vue';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { nord } from '@milkdown/theme-nord';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { history, undoCommand, redoCommand } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { prism } from '@milkdown/plugin-prism';
import {
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInHeadingCommand,
  toggleInlineCodeCommand,
  updateLinkCommand,
  updateImageCommand,
} from '@milkdown/preset-commonmark';
import { callCommand, replaceAll } from '@milkdown/utils';
import type { IElectronAPI } from './vite-env';

// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

// 响应式数据
const currentFile = ref<string>('');
const currentFilePath = ref<string>('');
const editorContent = ref<string>('');
const initialContent = '# 欢迎使用 Milkdown 编辑器\n\n开始编写你的 Markdown 内容...';
const hasUnsavedChanges = ref(false);
const loading = ref(true);
const editorContainerRef = ref<HTMLDivElement | null>(null);
const editor = shallowRef<Editor | undefined>();

// UI state
const isDarkMode = ref(false);
const spellCheckEnabled = ref(false);

// Dialog states
const showLinkDialog = ref(false);
const showImageDialog = ref(false);
const linkUrl = ref('https://');
const linkText = ref('');
const imageUrl = ref('https://');
const imageAlt = ref('');

// 计算属性
const characterCount = computed(() => editorContent.value.length);
const lineCount = computed(() => editorContent.value.split('\n').length);

// 通用命令调用函数
const call = (command: any, payload?: any) => {
  if (loading.value || !editor.value) return;
  
  try {
    editor.value.action(callCommand(command, payload));
  } catch (error) {
    console.error('Command execution failed:', error);
    // 如果命令执行失败，使用替代方案
    handleCommandFallback(command, payload);
  }
};

// 命令执行失败的替代方案 - 直接操作编辑器内容
const handleCommandFallback = (command: any, payload?: any) => {
  try {
    // 获取当前选中的文本
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    
    if (!selectedText) return;
    
    let newText = '';
    
    // 处理加粗命令
    if (command === toggleStrongCommand) {
      // 检查是否已经是粗体格式
      if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
        newText = selectedText.slice(2, -2); // 移除粗体标记
      } else {
        newText = `**${selectedText}**`; // 添加粗体标记
      }
    }
    // 处理斜体命令
    else if (command === toggleEmphasisCommand) {
      // 检查是否已经是斜体格式
      if (selectedText.startsWith('*') && selectedText.endsWith('*') && !selectedText.startsWith('**')) {
        newText = selectedText.slice(1, -1); // 移除斜体标记
      } else {
        newText = `*${selectedText}*`; // 添加斜体标记
      }
    }
    // 处理行内代码命令
    else if (command === toggleInlineCodeCommand) {
      // 检查是否已经是代码格式
      if (selectedText.startsWith('`') && selectedText.endsWith('`')) {
        newText = selectedText.slice(1, -1); // 移除代码标记
      } else {
        newText = `\`${selectedText}\``; // 添加代码标记
      }
    }
    // 处理标题命令
    else if (command === wrapInHeadingCommand && typeof payload === 'number') {
      const headingPrefix = '#'.repeat(payload);
      newText = `${headingPrefix} ${selectedText}`;
    }
    
    if (newText) {
      // 替换选中的文本
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
      
      // 更新编辑器内容
      setTimeout(() => {
        const editorEl = editorContainerRef.value?.querySelector('.milkdown');
        if (editorEl) {
          editorContent.value = editorEl.textContent || '';
          hasUnsavedChanges.value = true;
        }
      }, 100);
    }
  } catch (error) {
    console.error('替代命令执行失败:', error);
  }
};

// 文件操作
const newFile = () => {
  if (hasUnsavedChanges.value && !confirm('当前文件有未保存的更改，确定要新建文件吗？')) {
    return;
  }
  
  currentFile.value = '';
  currentFilePath.value = '';
  const newContent = '# 新文档\n\n开始编写...';
  editorContent.value = newContent;
  editor.value?.action(replaceAll(newContent));
  setTimeout(() => {
    hasUnsavedChanges.value = false;
  }, 100);
};

const openFile = () => {
  // 由主进程触发
  console.log('请求打开文件...');
};

const saveFile = async () => {
  if (!window.electronAPI) {
    alert('仅在 Electron 环境下支持保存文件！');
    return;
  }
  
  try {
    const result = await window.electronAPI.saveFile({
      path: currentFilePath.value || undefined,
      content: editorContent.value,
    });
    
    if (result.success) {
      hasUnsavedChanges.value = false;
      if (result.path) {
        currentFilePath.value = result.path;
        currentFile.value = result.path.split(/[\\/]/).pop() || '';
      }
      console.log('文件保存成功');
    } else {
      console.error('文件保存失败:', result.error);
      alert(`文件保存失败: ${result.error}`);
    }
  } catch (error) {
    console.error('保存文件时出错:', error);
    alert(`保存文件时出错: ${error}`);
  }
};

const saveAsFile = async () => {
  if (!window.electronAPI) {
    alert('仅在 Electron 环境下支持另存为！');
    return;
  }
  
  try {
    const result = await window.electronAPI.saveFile({
      content: editorContent.value,
    });
    
    if (result.success && result.path) {
      hasUnsavedChanges.value = false;
      currentFilePath.value = result.path;
      currentFile.value = result.path.split(/[\\/]/).pop() || '';
      console.log('文件另存为成功');
    }
  } catch (error) {
    console.error('另存为文件时出错:', error);
    alert(`另存为文件时出错: ${error}`);
  }
};

// 特殊编辑器操作
const insertLink = () => {
  linkUrl.value = 'https://';
  linkText.value = '';
  showLinkDialog.value = true;
};

const confirmInsertLink = () => {
  if (linkUrl.value) {
    call(updateLinkCommand, { href: linkUrl.value });
  }
  showLinkDialog.value = false;
};

const insertImage = () => {
  imageUrl.value = 'https://';
  imageAlt.value = '';
  showImageDialog.value = true;
};

const confirmInsertImage = () => {
  if (imageUrl.value) {
    call(updateImageCommand, { src: imageUrl.value, alt: imageAlt.value || '' });
  }
  showImageDialog.value = false;
};

// UI控制函数
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  document.documentElement.setAttribute('data-theme', isDarkMode.value ? 'dark' : 'light');
};

const toggleSpellCheck = () => {
  spellCheckEnabled.value = !spellCheckEnabled.value;
  if (editorContainerRef.value) {
    const proseMirrorElement = editorContainerRef.value.querySelector('.ProseMirror') as HTMLElement;
    if (proseMirrorElement) {
      proseMirrorElement.spellcheck = spellCheckEnabled.value;
    }
  }
};

// Electron 菜单事件处理
const setupElectronEvents = () => {
  if (window.electronAPI) {
    window.electronAPI.onMenuNewFile(newFile);
    
    window.electronAPI.onMenuOpenFile((data: { path: string; content: string }) => {
      if (hasUnsavedChanges.value && !confirm('当前文件有未保存的更改，确定要打开新文件吗？')) {
        return;
      }
      currentFile.value = data.path.split(/[\\/]/).pop() || '';
      currentFilePath.value = data.path;
      editorContent.value = data.content;
      editor.value?.action(replaceAll(data.content));
      setTimeout(() => {
        hasUnsavedChanges.value = false;
      }, 100);
    });
    
    window.electronAPI.onMenuSaveFile(saveFile);
    window.electronAPI.onMenuSaveAsFile(saveAsFile);
  }
};

// 组件生命周期
onMounted(async () => {
  // Initialize content if empty
  if (!editorContent.value) {
    editorContent.value = initialContent;
  }
  
  if (editorContainerRef.value) {
    try {
      const newEditor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, editorContainerRef.value);
          ctx.set(defaultValueCtx, editorContent.value);
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(cursor)
        .use(prism)
        .use(listener)
        .config((ctx) => {
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            if (markdown === editorContent.value) return;
            editorContent.value = markdown;
            hasUnsavedChanges.value = true;
          });
        })
        .create();
        
      editor.value = newEditor;
      
      // 等待编辑器完全准备好
      await new Promise((resolve) => {
        const checkReady = () => {
          if (editor.value?.ctx) {
            resolve(true);
          } else {
            setTimeout(checkReady, 50);
          }
        };
        checkReady();
      });
      
      // Set up spellcheck (disabled by default)
      setTimeout(() => {
        const proseMirrorElement = editorContainerRef.value?.querySelector('.ProseMirror') as HTMLElement;
        if (proseMirrorElement) {
          proseMirrorElement.spellcheck = spellCheckEnabled.value;
        }
      }, 100);
      
      // 确保所有插件都已加载后再启用命令
      setTimeout(() => {
        loading.value = false;
        console.log('Editor fully initialized and ready for commands');
      }, 300);
    } catch (e) {
      console.error('Editor initialization failed:', e);
      loading.value = false;
    }
  }
  setupElectronEvents();
  
  // 添加键盘快捷键支持
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          call(toggleStrongCommand);
          break;
        case 'i':
          event.preventDefault();
          call(toggleEmphasisCommand);
          break;
        case 's':
          event.preventDefault();
          if (event.shiftKey) {
            saveAsFile();
          } else {
            saveFile();
          }
          break;
        case 'n':
          event.preventDefault();
          newFile();
          break;
        case 'o':
          event.preventDefault();
          openFile();
          break;
        case 'z':
          event.preventDefault();
          if (event.shiftKey) {
            call(redoCommand);
          } else {
            call(undoCommand);
          }
          break;
        case 'y':
          event.preventDefault();
          call(redoCommand);
          break;
      }
    }
  };
  
  document.addEventListener('keydown', handleKeyDown);
  
  // 清理键盘事件监听器
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
});

onUnmounted(() => {
  if (editor.value) {
    editor.value.destroy();
  }
  if (window.electronAPI) {
    window.electronAPI.removeAllListeners('menu-new-file');
    window.electronAPI.removeAllListeners('menu-open-file');
    window.electronAPI.removeAllListeners('menu-save-file');
    window.electronAPI.removeAllListeners('menu-save-as-file');
  }
});
</script>

<style>
/* Nord Theme 的样式覆盖和全局样式 */
:root {
  --bg-primary: #f4f6f8;
  --bg-secondary: #ffffff;
  --text-primary: #1f2937;
  --text-secondary: #4b5563;
  --border-color: #d1d5db;
  --border-light: #e5e7eb;
  --accent-color: #3b82f6;
  --accent-hover: #2563eb;
}

[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --border-color: #374151;
  --border-light: #4b5563;
  --accent-color: #60a5fa;
  --accent-hover: #3b82f6;
}

html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s, color 0.3s;
}

.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-primary);
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 8px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-group {
  display: flex;
  gap: 4px;
  border-right: 1px solid var(--border-light);
  padding-right: 12px;
  margin-right: 8px;
}
.toolbar-group:last-child {
  border-right: none;
  margin-right: 0;
  padding-right: 0;
}

.toolbar-button {
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s, border-color 0.2s;
  color: var(--text-primary);
}
.toolbar-button:hover {
  background-color: var(--bg-primary);
  border-color: var(--border-color);
}
.toolbar-button:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}
.toolbar-button.active {
  background-color: var(--accent-color);
  color: white;
}
.toolbar-button strong, .toolbar-button em {
  font-style: normal;
  font-weight: bold;
}

.file-info {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.file-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 4px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #6ee7b7; /* Green for saved */
}
.status-dot.unsaved {
  background-color: #facc15; /* Yellow for unsaved */
}

.editor-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: var(--bg-primary);
  position: relative;
  display: flex;
  justify-content: center;
}

.milkdown-editor {
  background: var(--bg-secondary);
  border: none;
  border-radius: 4px;
  box-shadow: none;
  height: 100%;
  box-sizing: border-box;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

.milkdown-editor .editor {
  padding: 2rem !important;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  border: none !important;
  outline: none !important;
  max-width: 100%;
  line-height: 1.6;
}

/* Remove all prosemirror editor borders and outlines */
.milkdown-editor .ProseMirror {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background: transparent !important;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
  color: var(--text-primary);
}

.milkdown-editor .ProseMirror:focus {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

/* Code syntax highlighting */
.milkdown-editor .ProseMirror pre {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1rem;
  overflow-x: auto;
}

.milkdown-editor .ProseMirror code {
  background-color: var(--bg-primary);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
}

.milkdown-editor .ProseMirror:focus {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

/* Ensure proper text flow */
.milkdown-editor .ProseMirror p,
.milkdown-editor .ProseMirror h1,
.milkdown-editor .ProseMirror h2,
.milkdown-editor .ProseMirror h3,
.milkdown-editor .ProseMirror h4,
.milkdown-editor .ProseMirror h5,
.milkdown-editor .ProseMirror h6 {
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

.dialog h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #1f2937;
}

.dialog-field {
  margin-bottom: 16px;
}

.dialog-field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #374151;
}

.dialog-field input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.dialog-field input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}

.dialog-actions button {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
}

.dialog-actions button:hover {
  background-color: #f9fafb;
}

.dialog-actions button.primary {
  background-color: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.dialog-actions button.primary:hover {
  background-color: #2563eb;
}
</style>
