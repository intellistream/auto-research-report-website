// Shared logical positions for the generation story and the numerical attention example.
export const promptPositions = [1, 2, 3] as const;
export const firstDecodePosition = promptPositions.length + 1;

export const generationFrames = [
  { title: "输入就绪", action: "处理输入", note: "将 x1、x2、x3 作为一批输入交给模型，准备进行预填充（Prefill）；此时还没有本层 KV。" },
  { title: "输入处理结束，采样得到 x4", action: "把 x4 送回模型", note: "三个输入位置已各自产生本层 KV 和注意力输出；最后输入位置的 y3 经后续模型计算、输出头与采样得到 x4。x4 尚未回送，缓存仍只到位置 3。" },
  { title: "回送 x4，计算它自己的 Q / K / V", action: "用 Q4 读取历史", note: "将 x4 作为本轮模型输入，计算出 Q4、K4、V4；前三个位置的 KV 沿用，新增 K4 / V4。旧 Q 不作为后续解码缓存。" },
  { title: "Q4 读取包括当前位置在内的 KV", action: "继续得到下一个 token", note: "先由 Q4 与 K1…K4 算出分数和权重，再按这些权重汇总 V1…V4，得到本层注意力输出向量 y4。此时尚未采样下一个 token；KV 仍到位置 4。" },
  { title: "y4 经后续计算与采样得到 x5", action: "把 x5 送回模型", note: "y4 经后续模型计算、输出头和采样得到 x5。x5 已选出但尚未回送，因此还没有 K5 / V5；缓存仍只到位置 4。" },
  { title: "回送 x5，计算它自己的 Q / K / V", action: "用 Q5 读取历史", note: "把 x5 回送为本轮模型输入，计算 Q5 / K5 / V5，将 K5 / V5 加入历史；此时缓存到位置 5，Q5 尚未读取历史，还没有向量 y5。" },
  { title: "Q5 读取包括当前位置在内的 KV", action: "本段演示结束", note: "Q5 对 K1…K5 求权重，并按权重汇总 V1…V5，得到 y5。读取不新增 KV；缓存仍到位置 5，标准生成可继续到停止条件。" },
] as const;

export function generationAt(frame: number) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= generationFrames.length) throw new RangeError("Invalid generation frame");
  const count = frame === 0 ? 0 : frame === 1 ? 3 : frame >= 5 ? 5 : 4;
  return {
    ...generationFrames[frame], frame,
    kvPositions: Array.from({ length: count }, (_, i) => i + 1),
    pendingToken: frame === 1 ? 4 : frame === 4 ? 5 : null,
    currentPosition: frame === 2 || frame === 3 ? 4 : frame >= 5 ? 5 : null,
    readPositions: frame === 3 || frame === 6 ? Array.from({ length: count }, (_, i) => i + 1) : [],
    // The last prompt output y3 is used to select x4 after the remaining model computation.
    attentionOutput: frame === 1 ? 3 : frame === 3 || frame === 4 ? 4 : frame === 6 ? 5 : null,
    // Old Q is not retained as the persistent cache for later decoding steps.
    newKVPosition: frame === 2 || frame === 3 ? 4 : frame >= 5 ? 5 : null,
  };
}

// Only newly created KV is written; reads reuse the existing cache, including the current position.
export function generationConnections(frame: number) {
  const current = generationAt(frame);
  const previous = frame ? generationAt(frame - 1).kvPositions : [];
  return {
    writePositions: current.kvPositions.filter(position => !previous.includes(position)),
    readPositions: current.readPositions,
    queryPosition: current.readPositions.length ? current.currentPosition : null,
  };
}
