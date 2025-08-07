"use client"
import { Button, Collapse } from 'antd'
import { MPLBoneFrame, Quaternion as MPLQuaternion, Vector3 as MPLVector3 } from "mmd-mpl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMPLCompiler } from "../ui/hooks/useMLPCompiler";
import { BpmxLoader, VpdLoader } from 'babylon-mmd'
import { Camera, Engine, RegisterSceneLoaderPlugin, Scene, Vector3 } from '@babylonjs/core'
import CodeViewer from '../ui/CodeViewer';
import { FundViewOutlined } from '@ant-design/icons';
export type jsonState = {
  prompt?: string,
  answer: string
}
export function MainClientPage({
  t
}: { t: any }) {

  const canvasRef = useRef(null)
  const vpdLoaderRef = useRef<VpdLoader>(null)
  const mplCompiler = useMPLCompiler()
  const [jsonState, setJsonState] = useState<jsonState[]>()
  const [processedFiles, setProcessedFiles] = useState<Set<string>>(new Set())
  const loadVPD = useCallback(
    async (vpdUrl: string): Promise<MPLBoneFrame[] | null> => {
      if (!vpdLoaderRef.current || !mplCompiler) return null

      const vpd = await vpdLoaderRef.current.loadAsync("vpd_pose", vpdUrl)
      // modelRef.current.addAnimation(vpd)
      // modelRef.current.setAnimation("vpd_pose")
      // modelRef.current.currentAnimation?.animate(0)
      const boneStates: MPLBoneFrame[] = []
      for (const boneTrack of vpd.boneTracks) {
        const boneNameJp = boneTrack.name
        const boneNameEn = mplCompiler.get_bone_english_name(boneNameJp)
        if (!boneNameEn) {
          continue
        }

        const rotation = boneTrack.rotations
        if (rotation.length === 0) continue

        if (!(rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0 && rotation[3] === 1)) {
          boneStates.push(
            new MPLBoneFrame(
              boneNameEn,
              boneNameJp,
              new MPLVector3(0, 0, 0),
              new MPLQuaternion(rotation[0], rotation[1], rotation[2], rotation[3])
            )
          )
        }
      }

      for (const boneTrack of vpd.movableBoneTracks) {
        const boneNameJp = boneTrack.name
        const boneNameEn = mplCompiler.get_bone_english_name(boneNameJp)
        if (!boneNameEn) {
          continue
        }
        let position = new MPLVector3(0, 0, 0)
        let rotation = new MPLQuaternion(0, 0, 0, 1)
        if (boneTrack.positions && boneTrack.positions.length > 0) {
          position = new MPLVector3(boneTrack.positions[0], boneTrack.positions[1], boneTrack.positions[2])
        }

        if (boneTrack.rotations && boneTrack.rotations.length > 0) {
          rotation = new MPLQuaternion(
            boneTrack.rotations[0],
            boneTrack.rotations[1],
            boneTrack.rotations[2],
            boneTrack.rotations[3]
          )
        }
        boneStates.push(new MPLBoneFrame(boneNameEn, boneNameJp, position, rotation))
      }
      return boneStates
    },
    [vpdLoaderRef, mplCompiler]
  )
  useEffect(() => {
    const init = async () => {
      if (!canvasRef.current || !mplCompiler) return
      RegisterSceneLoaderPlugin(new BpmxLoader())
      const engine = new Engine(canvasRef.current, true, {}, true)
      const scene = new Scene(engine)
      const camera = new Camera("camera_dd", new Vector3(), scene)
      vpdLoaderRef.current = new VpdLoader(scene)
      engine.runRenderLoop(() => {
        scene.render()
      })
    }
    init()
  }, [mplCompiler])
  return (
    <div className="flex flex-col items-center py-4 justify-center">
      {/* Информационная панель */}
      <div className="w-full max-w-4xl mb-6">
        <Collapse
          defaultActiveKey={['1']}
          items={[
            {
              key: '1',
              label: t.guide.title,
              children: (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-bold text-lg mb-2">{t.guide.howToUse1}</h3>
                    <p>{t.guide.howToUse2}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold">{t.guide.guide_instruction1.instruction1}</h4>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li>{t.guide.guide_instruction1.instruction2}</li>
                      <li>{t.guide.guide_instruction1.instruction3}</li>
                      <li>{t.guide.guide_instruction1.instruction4}</li>
                      <li>{t.guide.guide_instruction1.instruction5}</li>
                    </ol>
                  </div>,
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">{t.guide.howToUse2}</h4>
                    <ul className="space-y-1">
                      <li>• <strong>GitHub Issues:</strong> <a href="https://github.com/GOH23/pose2mpl/issues" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{t.guide.createIssue}</a></li>
                      <li>• <strong>Email:</strong> <a href="mailto:goh10117@gmail.com" className="text-blue-600 hover:underline">goh10117@gmail.com</a></li>
                      <li>• <strong>Telegram:</strong> <a href="https://t.me/goh222" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@goh222</a></li>
                      <li>• <strong>GitHub:</strong> <a href="https://github.com/GOH23/pose2mpl" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{t.guide.openSourceText}</a></li>
                    </ul>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">{t.guide.howToUse4}</h4>
                    <ul className="space-y-1">
                      <li>{t.guide.guide_instruction2.instruction1}</li>
                      <li>{t.guide.guide_instruction2.instruction2}</li>
                      <li>{t.guide.guide_instruction2.instruction3}</li>
                      <li>{t.guide.guide_instruction2.instruction4}</li>
                    </ul>
                  </div>
                </div>
              )
            }
          ]}
        />
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
        onDrop={async (e: React.DragEvent) => {
          e.preventDefault();
          console.log('onDrop triggered');
          const files = Array.from(e.dataTransfer.files);

          for (const file of files) {
            if (file.name.endsWith('.vpd') && !processedFiles.has(file.name)) {
              console.log('Processing dropped file:', file.name);
              setProcessedFiles(prev => new Set([...prev, file.name]));

              const fileUrl = URL.createObjectURL(file);
              const vpdFile = await loadVPD(fileUrl);
              if (vpdFile && mplCompiler) {
                const result = await mplCompiler.reverse_compile(file.name, vpdFile);
                setJsonState(prev => [...(prev || []), { prompt: undefined, answer: JSON.stringify(result) }]);
              }
            }
          }
        }}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.vpd';
          input.multiple = true;
          input.onchange = async (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files) {
              const files = Array.from(target.files);
              for (const file of files) {
                if (!processedFiles.has(file.name)) {
                  console.log('Processing selected file:', file.name);
                  setProcessedFiles(prev => new Set([...prev, file.name]));

                  const fileUrl = URL.createObjectURL(file);
                  const vpdFile = await loadVPD(fileUrl);
                  if (vpdFile && mplCompiler) {
                    const result = await mplCompiler.reverse_compile(`pose_ai`, vpdFile);
                    setJsonState(prev => [...(prev || []), { prompt: undefined, answer: JSON.stringify(result) }]);
                  }
                }
              }
            }
          };
          input.click();
        }}
      >
        <div className="text-4xl mb-4">📁</div>
        <p className="text-lg font-medium mb-2">{t.guide.clickAndSelect}</p>
        <p className="text-gray-500">
          {t.guide.allowedExtentionText}
        </p>
      </div>
      <div className='mt-4 flex gap-2'>
        <Button onClick={() => {
          //{"messages": [{"role": "system", "content": "Generate MMD Pose Language (MPL) script from description."}, {"role": "user", "content": "Description: A pose"}, {"role": "assistant", "content": ""}]}
          const result = jsonState?.map(el => {
            return JSON.stringify({
              messages: [
                { role: "system", content: "Generate MMD Pose Language (MPL) script from description." },
                { role: "user", content: `Description: ${el.prompt}` },
                { role: "assistant", content: JSON.parse(el.answer) }
              ]
            })
          })
          const blob = new Blob([result?.join('\n') || ''], { type: 'application/jsonl' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'dataset.jsonl'
          a.click()
        }}>{t.guide.downloadTitle}</Button>
        <Button onClick={() => {
          setJsonState([])
          setProcessedFiles(new Set())
        }}>{t.guide.clearAllTitle}</Button>
      </div>
      <div className='flex flex-wrap justify-center gap-2 mt-4 w-full'>
        {jsonState?.map((el, index) => {
          return <div className='border-2 border-gray-300 rounded-lg p-2 w-full relative max-w-[400px]' key={index}>
            <button type='button' className='cursor-pointer absolute size-8 flex items-center justify-center bg-red-500 text-white rounded-full  p-1 -top-2 -right-2' onClick={() => {
              setJsonState(jsonState?.filter((item, i) => i !== index))
            }}>X</button>

            <input className='w-full mb-2 border-1 border-gray-300 rounded-md p-2' placeholder='Prompt' type="text" value={el.prompt} onChange={(e) => {
              setJsonState(jsonState?.map((item, i) => {
                if (i === index) {
                  return { ...item, prompt: e.target.value }
                }
                return item
              }))
            }} />
            {/* <div className='flex my-2'>
              <button type='button' className='cursor-pointer flex items-center justify-center bg-blue-400 text-white rounded-md p-1'>
                <FundViewOutlined /> Предпросмотр
              </button>
            </div> */}
            <CodeViewer readOnly value={JSON.parse(el.answer)} />
          </div>
        })}

      </div>
      <canvas className='hidden' ref={canvasRef} />
    </div>
  );
}
