import { modelMLCAi } from "@/lib/ai/MLC_AI";
import CodeViewer from "./CodeViewer";
import { jsonState } from "../MainClientPage";
import { Dispatch, SetStateAction, useState } from "react";
import { ViewerMpl } from "./3DViewerMpl";
import { Loader2, Sparkles, Box, X, Trash2, Play, Square, RotateCw } from "lucide-react";
import { WasmMPLCompiler } from "mmd-mpl";

export default function BlockMpl({ 
  isLoading, 
  parsedAnswer, 
  ai_model, 
  item, 
  index, 
  mplCompiler,
  setJsonState, 
  setLoadingStates 
}: {
  isLoading: boolean,
  parsedAnswer: any,
  ai_model: modelMLCAi,
  item: jsonState,
  index: number,
  mplCompiler: WasmMPLCompiler,
  setJsonState: Dispatch<SetStateAction<jsonState[] | undefined>>,
  setLoadingStates: Dispatch<SetStateAction<Record<string, boolean>>>
}) {
  const [viewerMpl, setView] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl p-4 w-full relative max-w-sm 
                    bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Header with action buttons */}
      <div className="flex gap-2 justify-end mb-3">
        {/* AI Button */}
        <button
          type="button"
          onClick={async () => {
            if (!ai_model) {
              alert('AI модель не инициализирована');
              return;
            }

            setLoadingStates(prev => ({ ...prev, [index]: true }));

            try {
              let response = '';
              await ai_model.message(item.answer, (chunk) => {
                response += chunk;
              });

              const processedContent = response.split("</think>")[1] || '';

              setJsonState(prev => prev?.map((el, i) =>
                i === index ? { ...el, prompt: processedContent } : el
              ) ?? []);
            } catch (error) {
              console.error('Ошибка AI:', error);
              alert('Не удалось обработать ответ AI');
            } finally {
              setLoadingStates(prev => {
                const newState = { ...prev };
                delete newState[index];
                return newState;
              });
            }
          }}
          disabled={isLoading}
          className="px-3 py-2 bg-gradient-to-r from-purple-500 to-blue-500 
                     text-white rounded-lg font-medium text-sm cursor-pointer
                     hover:from-purple-600 hover:to-blue-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 transform hover:scale-105 active:scale-95
                     focus:outline-none focus:ring-2 focus:ring-purple-300
                     flex items-center gap-2 min-w-[80px] justify-center"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>AI</span>
            </>
          )}
        </button>

        {/* 3D Viewer Toggle */}
        <button
          type="button"
          className={`px-3 py-2 flex items-center gap-2 justify-center rounded-lg transition-all duration-200 cursor-pointer
                     ${viewerMpl 
                       ? 'bg-red-500 hover:bg-red-600 text-white' 
                       : 'bg-indigo-500 hover:bg-indigo-600 text-white'}`}
          onClick={() => setView(!viewerMpl)}
        >
          {viewerMpl ? (
            <>
              <X className="h-4 w-4" />
              <span>Закрыть</span>
            </>
          ) : (
            <>
              <Box className="h-4 w-4" />
              <span>3D</span>
            </>
          )}
        </button>

        {/* Delete Button */}
        <button
          type="button"
          className="px-3 py-2 flex items-center gap-2 justify-center bg-gray-100 hover:bg-red-500 
                     hover:text-white text-gray-700 rounded-lg transition-colors duration-200 cursor-pointer"
          onClick={() => {
            if (window.confirm('Вы уверены, что хотите удалить этот элемент?')) {
              setJsonState(prev => prev?.filter((_, i) => i !== index) ?? []);
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
          <span>Удалить</span>
        </button>
      </div>

      {/* Prompt Input */}
      <input
        className="w-full mb-3 border border-gray-300 rounded-lg p-3 focus:outline-none 
                   focus:ring-2 focus:ring-blue-400 focus:border-transparent
                   text-sm placeholder-gray-400"
        placeholder="Введите промпт для AI..."
        type="text"
        value={item.prompt}
        onChange={(e) => {
          setJsonState(prev => prev?.map((el, i) =>
            i === index ? { ...el, prompt: e.target.value } : el
          ) ?? []);
        }}
      />

      {/* Code Viewer */}
      <div className="mb-3">
        <CodeViewer value={parsedAnswer} onChange={function (value: string): void {
                  throw new Error("Function not implemented.");
              } } />
      </div>

      {/* 3D Viewer Section */}
      {viewerMpl && (
        <div className="border-t border-gray-200 pt-3 mt-3">
          {/* Viewer Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Box className="h-4 w-4 text-indigo-500" />
              3D Модель
            </h3>
            
            {/* Animation Controls - ТОЛЬКО ИКОНКИ */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setIsAnimating(true)}
                disabled={isAnimating}
                className={`p-2 rounded-md transition-all duration-200 flex items-center justify-center cursor-pointer
                           ${isAnimating 
                             ? 'bg-white text-green-600 shadow-sm' 
                             : 'hover:bg-white text-gray-600'}`}
                title="Старт анимации"
              >
                <Play className="h-4 w-4" />
              </button>
              
              <button
                type="button"
                onClick={() => setIsAnimating(false)}
                disabled={!isAnimating}
                className={`p-2 rounded-md transition-all duration-200 flex items-center justify-center cursor-pointer
                           ${!isAnimating 
                             ? 'bg-white text-red-600 shadow-sm' 
                             : 'hover:bg-white text-gray-600'}`}
                title="Стоп анимации"
              >
                <Square className="h-4 w-4" />
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setIsAnimating(false);
                  setTimeout(() => setIsAnimating(true), 100);
                }}
                className="p-2 rounded-md hover:bg-white transition-all duration-200 
                           flex items-center justify-center text-gray-600 cursor-pointer"
                title="Перезапустить анимацию"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 3D Viewer Component */}
          <ViewerMpl mplCompiler={mplCompiler} mpl_code={item.answer}/>
        </div>
      )}
    </div>
  );
}