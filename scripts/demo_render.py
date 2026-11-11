# -*- coding: utf-8 -*-
"""Render terminal-style demo frames for agent-refactor. Backend for record-demo.mjs.

Usage: python demo_render.py <spec.json>

spec: {
  width, height, fps, duration,
  events: [ {t, type, ...} ],   # type = line | typing | typing_prompt | progress | card | ending
  card_image: path | null,
  out_dir: path,
}
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

BG = (11, 14, 20, 255)
WIN = (13, 17, 23, 255)
TITLEBAR = (22, 27, 34, 255)
BORDER = (33, 38, 45, 255)
DIM = (139, 148, 158)
FG = (201, 209, 217)
GREEN = (63, 185, 80)
CYAN = (88, 166, 255)
YELLOW = (255, 216, 102)
RED = (255, 107, 107)
PROMPT = (86, 212, 221)

FONT_DIR = r"C:\Windows\Fonts"
CONSOLA = os.path.join(FONT_DIR, "consola.ttf")
CONSOLAB = os.path.join(FONT_DIR, "consolab.ttf")
MSYH = os.path.join(FONT_DIR, "msyh.ttc")
MSYHBD = os.path.join(FONT_DIR, "msyhbd.ttc")
SEGUISYM = os.path.join(FONT_DIR, "seguisym.ttf")

SYMBOLS = set("⚠✓✔✗↳→←↑↓─│└├┌┐┘┬┴┼█▌▍●○◆▸·")


class Fonts:
    def __init__(self, size):
        self.size = size
        self.ascii = ImageFont.truetype(CONSOLA, size)
        self.ascii_b = ImageFont.truetype(CONSOLAB, size)
        self.cjk = ImageFont.truetype(MSYH, size - 1)
        self.cjk_b = ImageFont.truetype(MSYHBD, size - 1)
        self.sym = ImageFont.truetype(SEGUISYM, size - 1) if os.path.exists(SEGUISYM) else self.ascii
        self.cell = self.ascii.getlength("M")

    def pick(self, bold):
        return (self.ascii_b, self.cjk_b) if bold else (self.ascii, self.cjk)


def is_cjk(ch):
    return ord(ch) > 0x2E7F and ch not in SYMBOLS


def text_width(text, fonts, bold):
    fa, fc = fonts.pick(bold)
    w = 0
    for ch in text:
        if ch in SYMBOLS:
            w += fonts.cell
        elif is_cjk(ch):
            w += fonts.cell * 2
        elif ch == " ":
            w += fonts.cell
        else:
            w += fa.getlength(ch)
    return w


def draw_run(draw, x, baseline, text, fonts, bold, color, alpha=255):
    """CJK advances two cells, ASCII uses natural advance; symbols use Segoe UI Symbol."""
    fa, fc = fonts.pick(bold)
    cell = fonts.cell
    fill = (color[0], color[1], color[2], alpha)
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == " ":
            x += cell
            i += 1
            continue
        if ch in SYMBOLS:
            draw.text((x, baseline), ch, font=fonts.sym, fill=fill, anchor="ls")
            x += cell
            i += 1
            continue
        if is_cjk(ch):
            draw.text((x + cell * 0.06, baseline), ch, font=fc, fill=fill, anchor="ls")
            x += cell * 2
            i += 1
            continue
        j = i
        while j < n and not is_cjk(text[j]) and text[j] != " " and text[j] not in SYMBOLS:
            j += 1
        seg = text[i:j]
        draw.text((x, baseline), seg, font=fa, fill=fill, anchor="ls")
        x += fa.getlength(seg)
        i = j
    return x


def build_window(w, h, fonts):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 24, 24, w - 24, h - 24
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x0 - 4, y0 + 8, x1 + 4, y1 + 14), radius=18, fill=(0, 0, 0, 140))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(shadow)
    d.rounded_rectangle((x0, y0, x1, y1), radius=14, fill=WIN, outline=BORDER, width=1)
    d.rounded_rectangle((x0, y0, x1, y0 + 38), radius=14, fill=TITLEBAR)
    d.rectangle((x0, y0 + 24, x1, y0 + 38), fill=TITLEBAR)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((x0 + 18 + i * 22, y0 + 14, x0 + 30 + i * 22, y0 + 26), fill=c)
    draw_run(d, x0 + 96, y0 + 26, "agent-refactor — 本地代码库体检", fonts, False,
             (139, 148, 158), 190)
    d.line((x0 + 1, y1 - 34, x1 - 1, y1 - 34), fill=(33, 38, 45, 255))
    status = "agent-refactor v0.1.0  ·  零依赖  ·  本地运行"
    draw_run(d, x1 - 24 - text_width(status, fonts, False), y1 - 10, status, fonts, False,
             (139, 148, 158), 150)
    return img


def main():
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        spec = json.load(f)

    W, H = spec["width"], spec["height"]
    fps = spec["fps"]
    duration = spec["duration"]
    out_dir = spec["out_dir"]
    os.makedirs(out_dir, exist_ok=True)

    fonts = Fonts(spec.get("font_size", 21))
    win = build_window(W, H, fonts)
    line_h = spec.get("line_height", 30)
    text_x = 24 + 26
    text_top = 24 + 38 + 30
    text_bottom = H - 24 - 46
    max_lines = int((text_bottom - text_top) // line_h)

    card_path = spec.get("card_image")
    card = None
    if card_path and os.path.exists(card_path):
        im = Image.open(card_path).convert("RGB")
        crop = spec.get("card_crop", [24, 20, 1176, 700])
        l, tp, r, bt = crop
        r = min(r, im.size[0])
        bt = min(bt, im.size[1])
        im = im.crop((max(0, l), max(0, tp), r, bt))
        tw = spec.get("card_width", 760)
        th = int(im.size[1] * tw / im.size[0])
        im = im.resize((tw, th), Image.LANCZOS)
        mask = Image.new("L", im.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0], im.size[1]), radius=10, fill=255)
        card = (im, mask)

    events = spec["events"]
    total = int(round(duration * fps))
    for idx in range(total):
        t = idx / fps
        frame = Image.new("RGBA", (W, H), BG)
        gd = ImageDraw.Draw(frame)
        for gy in range(0, H, 48):
            gd.line((0, gy, W, gy), fill=(255, 255, 255, 3))
        for gx in range(0, W, 48):
            gd.line((gx, 0, gx, H), fill=(255, 255, 255, 3))

        terminal_alpha = 0
        if t >= spec.get("terminal_in", 2.2):
            terminal_alpha = int(min(1.0, (t - spec["terminal_in"]) / 0.5) * 255)
        dim_start = spec.get("terminal_dim", 1e9)
        dim_end = spec.get("card_out", 1e9)
        dim_factor = 1.0
        if dim_start <= t <= dim_end:
            dim_factor = spec.get("terminal_dim_alpha", 0.3)
        elif dim_end < t < dim_end + 0.5:
            k = (t - dim_end) / 0.5
            dim_factor = spec.get("terminal_dim_alpha", 0.3) + (1 - spec.get("terminal_dim_alpha", 0.3)) * k
        terminal_alpha = int(terminal_alpha * dim_factor)

        # 窗口底色先画，文字后叠（反过来会被窗口盖住）
        if terminal_alpha > 0:
            wl = win.copy()
            if terminal_alpha < 255:
                a = wl.split()[3].point(lambda v: int(v * terminal_alpha / 255))
                wl.putalpha(a)
            frame.alpha_composite(wl)

            canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            cd = ImageDraw.Draw(canvas)
            rendered = []
            for e in events:
                if e["t"] > t:
                    continue
                if e["type"] not in ("line", "typing", "progress", "typing_prompt"):
                    continue
                if e["type"] == "progress" and t > e["t"] + e.get("dur", 3.0) + 0.12:
                    continue
                rendered.append(e)
            if len(rendered) > max_lines:
                rendered = rendered[-max_lines:]
            y = text_top
            cursor_at = None
            for e in rendered:
                alpha = int(min(1.0, (t - e["t"]) / 0.16) * 255)
                color = tuple(e.get("color", FG))
                typ = e["type"]
                if typ == "line":
                    draw_run(cd, text_x, y + 22, e["text"], fonts, e.get("bold", False), color, alpha)
                elif typ in ("typing", "typing_prompt"):
                    full = e["text"]
                    dur = max(0.001, e.get("dur", 1.2))
                    frac = min(1.0, (t - e["t"]) / dur)
                    shown = full[: max(1, int(len(full) * frac))] if frac < 1 else full
                    px = text_x
                    if typ == "typing_prompt":
                        px = draw_run(cd, px, y + 22, e.get("prompt", "$ "), fonts, True,
                                      tuple(e.get("prompt_color", PROMPT)), alpha)
                    end_x = draw_run(cd, px, y + 22, shown, fonts, False, color, alpha)
                    cursor_at = (end_x + 2, y + 2, color)
                elif typ == "progress":
                    dur = max(0.001, e.get("dur", 3.0))
                    frac = min(1.0, max(0.0, (t - e["t"]) / dur))
                    files = e.get("files", [])
                    n = len(files)
                    done = min(n, int(frac * n + 0.0001))
                    spin = "|/-\\"[int(t * 12) % 4]
                    head = "%s %s %d files" % (spin, e.get("label", "Scanning"), e.get("total", n))
                    ex = draw_run(cd, text_x, y + 22, head + "  ", fonts, False,
                                  tuple(e.get("color", CYAN)), alpha)
                    bar_w, bar_h = 260, 10
                    by = y + 22 - bar_h + 1
                    cd.rectangle((ex, by, ex + bar_w, by + bar_h), fill=(48, 54, 61, alpha))
                    fillw = int(bar_w * frac)
                    if fillw > 0:
                        cd.rectangle((ex, by, ex + fillw, by + bar_h),
                                     fill=tuple(e.get("bar_color", GREEN)) + (alpha,))
                    counter = "  %d/%d  %s" % (done, n, files[min(done, n) - 1] if done else files[0])
                    draw_run(cd, ex + bar_w + 8, y + 22, counter, fonts, False, DIM, alpha)
                y += line_h
            if cursor_at:
                cx, cy, cc = cursor_at
                if int(t * 2.4) % 2 == 0 or spec.get("cursor_solid", False):
                    cd.rectangle((cx, cy, cx + fonts.cell - 1, cy + 20), fill=tuple(cc) + (210,))
            frame.alpha_composite(canvas)

        # title intro
        tin = spec.get("title_in", 0.0)
        tout = spec.get("title_out", 2.2)
        if t < tout:
            a = max(0.0, min(1.0, (t - tin) / 0.5) * min(1.0, (tout - t) / 0.45))
            ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            od = ImageDraw.Draw(ov)
            big = ImageFont.truetype(CONSOLAB, 64)
            sub = ImageFont.truetype(MSYH, 26)
            od.text((W // 2, 286), "agent-refactor", font=big, fill=(255, 255, 255, int(245 * a)), anchor="ms")
            od.text((W // 2, 344), "本地代码库体检", font=sub, fill=(86, 212, 221, int(235 * a)), anchor="ms")
            lw = int(260 * a)
            od.rectangle((W // 2 - lw // 2, 372, W // 2 + lw // 2, 374), fill=(63, 185, 80, int(200 * a)))
            frame.alpha_composite(ov)

        # report card
        cin = spec.get("card_in")
        cout = spec.get("card_out", 1e9)
        if card and cin is not None and cin <= t < cout + 0.45:
            im, mask = card
            prog = min(1.0, (t - cin) / 0.55)
            ease = 1 - (1 - prog) ** 3
            out_a = 1.0
            if t > cout:
                out_a = max(0.0, 1 - (t - cout) / 0.45)
            cw, chh = im.size
            cx = (W - cw) // 2
            cy = int((H - chh) // 2 + (1 - ease) * 46)
            dimlayer = Image.new("RGBA", (W, H), (4, 6, 10, int(170 * out_a * ease)))
            frame.alpha_composite(dimlayer)
            shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(shadow).rounded_rectangle((cx - 6, cy + 12, cx + cw + 6, cy + chh + 18),
                                                     radius=16, fill=(0, 0, 0, int(190 * out_a * ease)))
            frame.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            layer.paste(im, (cx, cy), mask)
            ld = ImageDraw.Draw(layer)
            ld.rounded_rectangle((cx, cy, cx + cw - 1, cy + chh - 1), radius=10,
                                 outline=(88, 166, 255, 130), width=1)
            if out_a < 1:
                aa = layer.split()[3].point(lambda v: int(v * out_a))
                layer.putalpha(aa)
            frame.alpha_composite(layer)
            if out_a > 0.5:
                ld2 = ImageDraw.Draw(frame)
                lbl = "agent-refactor-report.html"
                lf = ImageFont.truetype(CONSOLAB, 15)
                ld2.text((cx + cw - lf.getlength(lbl) - 4, cy - 26), lbl, font=lf,
                         fill=(88, 166, 255, 210))

        # ending
        ein = spec.get("ending_in")
        if ein is not None and t >= ein:
            a = min(1.0, (t - ein) / 0.6)
            blurred = frame.filter(ImageFilter.GaussianBlur(6))
            frame.paste(blurred, (0, 0), Image.new("L", (W, H), int(255 * a)))
            ov = Image.new("RGBA", (W, H), (4, 6, 10, int(205 * a)))
            od = ImageDraw.Draw(ov)
            cmd_f = ImageFont.truetype(CONSOLAB, 34)
            tag_f = ImageFont.truetype(MSYH, 22)
            small_f = ImageFont.truetype(MSYH, 15)
            cy = 258
            od.text((W // 2, cy), "npx agent-refactor scan .", font=cmd_f,
                    fill=(255, 255, 255, int(250 * a)), anchor="ms")
            od.text((W // 2, cy + 62), "先体检，再动手", font=tag_f,
                    fill=(86, 212, 221, int(240 * a)), anchor="ms")
            od.text((W // 2, cy + 104), "死代码 · 未用依赖 · 循环依赖，每条结论都附证据链", font=small_f,
                    fill=(139, 148, 158, int(210 * a)), anchor="ms")
            lw = int(300 * a)
            od.rectangle((W // 2 - lw // 2, cy + 34, W // 2 + lw // 2, cy + 35),
                         fill=(63, 185, 80, int(170 * a)))
            frame.alpha_composite(ov)

        frame.convert("RGB").save(os.path.join(out_dir, "f%05d.png" % idx), compress_level=3)
        if idx % 120 == 0:
            print("frame %d/%d" % (idx, total), flush=True)

    print("done %d frames -> %s" % (total, out_dir), flush=True)


if __name__ == "__main__":
    main()
