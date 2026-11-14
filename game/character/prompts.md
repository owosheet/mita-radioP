# 蜜塔（Mita）角色提示詞與製作步驟

方向 A「軟化保留」：白金雙馬尾、黑×黃配色、黃星貼紙、黃黑耳機、寬鬆黑連帽衫。妹系二次元，氣質溫柔、親近、帶點小調皮。

## 色票

| 用途 | 色 |
|---|---|
| 主黃 | `#ffd028` |
| 紅 | `#ff4468` |
| 青 | `#3fe0dc` |
| 攝影機背景 | `#161a26` |

## 出圖設定

- 模型：`grok/grok-imagine-image-quality`
- 尺寸：1024×1024
- quality：`high`；complexity：`high`
- 背景：`opaque`，純綠 `#00FF00`（去背用；不要用白色，白金髮會和背景黏在一起）
- 角色參考：概念圖 A（`research/concepts/a-soft.jpg`，不進公開站）

## 概念圖（方向 A）

```text
Anime character design, a cute young adult woman with a sweet little-sister vibe. Long platinum-white hair in high twin tails with soft bangs, round soft face, large warm amber eyes, light pink blush, a small yellow star sticker on her cheek instead of an eye patch. Oversized black hoodie with yellow hazard-stripe accents, a yellow star patch, and chunky black-and-yellow headphones resting around her neck. Black shorts, black-and-yellow sneakers. Friendly, approachable and slightly playful. Upper body, facing the viewer, centered, relaxed closed mouth, calm gentle expression, fully clothed, wholesome, non-sexualized. Anime key visual, clean crisp line art, cel shading, soft warm lighting, plain flat light warm-gray background, no text, no watermark, no scenery, high quality.
```

## Base（透明用的綠幕版）

```text
Use the reference image as the exact character design. Same character, same hairstyle, same outfit, same colors, same yellow star cheek sticker and yellow-black headphones. Full upper body, standing straight, facing the viewer, centered, head fully in frame with space above the hair, eyes open looking at the viewer, mouth closed with relaxed lips, calm neutral expression, no smile. Oversized black hoodie with yellow hazard-stripe sleeves and a yellow star patch, black shorts, black-and-yellow wrist cuffs. Fully clothed, wholesome, non-sexualized. Anime key visual, clean crisp line art, cel shading, soft even lighting. Isolated character on a solid pure green background (#00FF00), flat uniform green, no shadow on the background, no scenery, no text, no watermark.
```

## 差分提示詞

以 base 的綠幕版為 `reference_images`，每次只改一個地方。

### blink（閉眼）

```text
Use the reference image exactly. Same character, same pose, same framing, same outfit, same hair, same green background, same lighting and colors. Change only her eyes: both eyes gently closed, relaxed eyelids with soft eyelashes. Keep her mouth closed and neutral. Keep everything else pixel-identical: eyebrows, nose, cheek sticker, headphones, hair, clothing, background. Do not move, resize or restyle the character. Anime key visual, clean line art, cel shading, no text, no watermark.
```

### half_blink（半眨）

```text
Use the reference image exactly. Same character, same pose, same framing, same outfit, same hair, same green background, same lighting and colors. Change only her eyes: both eyes half-closed, upper eyelids lowered halfway, relaxed sleepy look. Keep her mouth closed and neutral. Keep everything else pixel-identical: eyebrows, nose, cheek sticker, headphones, hair, clothing, background. Do not move, resize or restyle the character. Anime key visual, clean line art, cel shading, no text, no watermark.
```

### mouth_half（嘴半開）

```text
Use the reference image exactly. Same character, same pose, same framing, same outfit, same hair, same green background, same lighting and colors. Change only her mouth: lips slightly parted, small relaxed oval opening, as if about to speak. Keep both eyes open and unchanged, neutral gaze. Keep everything else pixel-identical: eyebrows, nose, cheek sticker, headphones, hair, clothing, background. Do not move, resize or restyle the character. Anime key visual, clean line art, cel shading, no text, no watermark.
```

### mouth_open（嘴開）

```text
Use the reference image exactly. Same character, same pose, same framing, same outfit, same hair, same green background, same lighting and colors. Change only her mouth: mouth open as if speaking, lips parted in a natural oval, visible dark mouth interior, small tongue, anime style. Keep both eyes open and unchanged, neutral gaze. Keep everything else pixel-identical: eyebrows, nose, cheek sticker, headphones, hair, clothing, background. Do not move, resize or restyle the character. Anime key visual, clean line art, cel shading, no text, no watermark.
```

### smile_mouth（微笑）

```text
Use the reference image exactly. Same character, same pose, same framing, same outfit, same hair, same green background, same lighting and colors. Change only her mouth: a gentle warm smile, lips slightly parted and corners raised, soft happy expression. Keep both eyes open and unchanged, neutral gaze. Keep everything else pixel-identical: eyebrows, nose, cheek sticker, headphones, hair, clothing, background. Do not move, resize or restyle the character. Anime key visual, clean line art, cel shading, no text, no watermark.
```

## Negative prompt（共用）

出圖工具如果有獨立的 negative prompt 欄位，每張都接上這段。本次使用的工具沒有這個欄位，所以把 `no text`、`no watermark`、`no scenery` 直接寫進上面的提示詞；以下清單是給支援 negative prompt 的工具補強用：

```text
lowres, blurry, sketch, monochrome, deformed anatomy, extra fingers, missing fingers, asymmetric eyes, crossed eyes, extra limbs, watermark, signature, text, logo, cropped head, out of frame, scenery, background objects, green glow, green fringe, harsh shadows, photorealistic, 3d render, chibi, sexualized, nsfw
```

## 後處理（Pillow）

1. **去背**：以純綠 `#00FF00` 做 chroma key。
   - `key = G - max(R, B)`
   - `alpha = clamp((110 - key) / (110 - 40), 0, 1)`
   - despill：`G = min(G, max(R, B) + 10)`
2. **縮放**：premultiplied alpha 後，1024→960（LANCZOS），避免白髮邊緣出現綠邊。
3. **定位**：貼到 896×768 透明畫布，偏移 `(-32, +50)`（左右各裁 32px、整體下移 50px，下方超出畫布的部分裁掉）。
4. **差分裁切**（在 base 座標）：
   - 眼：`x=355, y=215, w=185, h=80`
   - 嘴：`x=405, y=295, w=90, h=50`
   - 由 base 座標換算回 1024 原圖：`src = (base − offset) / 0.9375`（offset = `(-32, +50)`，即 `((x + 32) / 0.9375, (y − 50) / 0.9375)`），再縮回目標尺寸。
   - 邊緣羽化 7px。
5. **depth**：本次省略。播放器沒有 depth 也能運作（少了頭部轉向與後髮搖動）。若之後要補，優先用 Depth Anything V2 之類的模型，不要用徑向近似。

## 產出檔案

- `character/base.png`（896×768 RGBA）
- `character/blink.png`、`character/half_blink.png`
- `character/mouth_half.png`、`character/mouth_open.png`、`character/smile_mouth.png`
- `character/character.json`

舊素材備份在 `.trellis/tasks/11-10-mita-character-redesign/research/backup/`。
