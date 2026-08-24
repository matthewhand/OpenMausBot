import math
import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 800
HEIGHT = 500

BG_DARK = (18, 19, 22)
PANEL_BG = (26, 27, 32)
CARD_BG = (35, 37, 44)
INSET_BG = (14, 15, 17)
ACCENT_BLUE = (59, 130, 246)
ACCENT_GREEN = (16, 185, 129)
ACCENT_AMBER = (245, 158, 11)
ACCENT_PURPLE = (168, 85, 247)
TEXT_WHITE = (241, 245, 249)
TEXT_MUTED = (148, 163, 184)
TEXT_DIM = (100, 116, 139)
BORDER_COLOR = (45, 48, 58)
SUCCESS_BG = (6, 78, 59)
SUCCESS_TEXT = (52, 211, 153)
CODE_BG = (22, 27, 34)

def get_font(size=14, bold=False):
    font_names = ["arialbd.ttf" if bold else "arial.ttf", "segoeuib.ttf" if bold else "segoeui.ttf", "consola.ttf"]
    for name in font_names:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

FONT_TITLE = get_font(18, bold=True)
FONT_HEADING = get_font(15, bold=True)
FONT_BODY = get_font(13, bold=False)
FONT_BOLD = get_font(13, bold=True)
FONT_SMALL = get_font(11, bold=False)
FONT_SMALL_BOLD = get_font(11, bold=True)
FONT_CODE = get_font(12, bold=False)

def draw_rounded_rect(draw, xy, rad, fill=None, outline=None, width=1):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=rad, fill=fill, outline=outline, width=width)

def draw_header(draw, title, subtitle):
    draw_rounded_rect(draw, [0, 0, WIDTH, 48], 0, fill=PANEL_BG, outline=BORDER_COLOR)
    draw.ellipse([14, 18, 24, 28], fill=(239, 68, 68))
    draw.ellipse([30, 18, 40, 28], fill=(245, 158, 11))
    draw.ellipse([46, 18, 56, 28], fill=(16, 185, 129))
    draw.text((70, 14), "OpenMausBot", fill=TEXT_WHITE, font=FONT_HEADING)
    draw_rounded_rect(draw, [170, 15, 230, 33], 4, fill=INSET_BG, outline=BORDER_COLOR)
    draw.text((176, 17), "v2.0 LAN", fill=ACCENT_BLUE, font=FONT_SMALL_BOLD)
    draw.text((WIDTH - 280, 16), title, fill=TEXT_MUTED, font=FONT_BODY)
    draw_rounded_rect(draw, [WIDTH - 100, 12, WIDTH - 16, 36], 6, fill=ACCENT_BLUE)
    draw.text((WIDTH - 84, 16), "Live", fill=(255, 255, 255), font=FONT_BOLD)

def draw_sidebar(draw, active_item="Chief of Staff"):
    draw_rounded_rect(draw, [0, 48, 200, HEIGHT], 0, fill=INSET_BG, outline=BORDER_COLOR)
    draw.text((16, 62), "BOT SWARM", fill=TEXT_DIM, font=FONT_SMALL_BOLD)
    bots = [
        ("Chief of Staff", "Coordinator", ACCENT_PURPLE),
        ("Coder", "Claude Sonnet 3.7", ACCENT_BLUE),
        ("Architect", "GPT-4o / Grok", ACCENT_GREEN),
        ("Reviewer", "DeepSeek R1", ACCENT_AMBER),
    ]
    y = 86
    for name, desc, col in bots:
        is_active = (name == active_item)
        if is_active:
            draw_rounded_rect(draw, [8, y, 192, y + 44], 8, fill=CARD_BG, outline=BORDER_COLOR)
        draw.ellipse([16, y + 12, 34, y + 30], fill=col)
        draw.text((42, y + 6), name, fill=TEXT_WHITE if is_active else TEXT_MUTED, font=FONT_BOLD if is_active else FONT_BODY)
        draw.text((42, y + 24), desc, fill=TEXT_DIM, font=FONT_SMALL)
        y += 50

def create_multibot_walkthrough(output_path):
    frames = []
    steps = [
        {"desc": "User submits prompt to Chief of Staff", "typed": "Implement auth middleware and audit routing", "show_delegation": False, "show_approval": False, "show_done": False},
        {"desc": "Chief of Staff plans and routes tasks", "typed": "Implement auth middleware and audit routing", "show_plan": True, "show_delegation": False, "show_approval": False, "show_done": False},
        {"desc": "Delegating to @Coder via delegate_bot", "typed": "Implement auth middleware and audit routing", "show_plan": True, "show_delegation": True, "show_approval": False, "show_done": False},
        {"desc": "Live Peer Approval Card: Command Inspection", "typed": "Implement auth middleware and audit routing", "show_plan": True, "show_delegation": True, "show_approval": True, "show_done": False},
        {"desc": "User Grants Approval -> Coder finishes task", "typed": "Implement auth middleware and audit routing", "show_plan": True, "show_delegation": True, "show_approval": "approved", "show_done": False},
        {"desc": "Chief of Staff aggregates results seamlessly", "typed": "Implement auth middleware and audit routing", "show_plan": True, "show_delegation": True, "show_approval": "approved", "show_done": True},
    ]
    for i, step in enumerate(steps):
        repeat = 3 if i != len(steps)-1 else 5
        for r in range(repeat):
            img = Image.new("RGB", (WIDTH, HEIGHT), BG_DARK)
            draw = ImageDraw.Draw(img)
            draw_header(draw, "Multi-Bot Orchestration", "")
            draw_sidebar(draw, "Chief of Staff")
            cx = 216
            cy = 60
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 28], 6, fill=PANEL_BG, outline=BORDER_COLOR)
            draw.text((cx + 12, cy + 6), f"Step {i+1}/6: {step['desc']}", fill=ACCENT_BLUE, font=FONT_SMALL_BOLD)
            cy += 38
            draw_rounded_rect(draw, [cx, cy, cx + 450, cy + 44], 10, fill=CARD_BG, outline=BORDER_COLOR)
            draw.text((cx + 14, cy + 8), "You", fill=ACCENT_BLUE, font=FONT_SMALL_BOLD)
            draw.text((cx + 14, cy + 24), step["typed"], fill=TEXT_WHITE, font=FONT_BODY)
            if step.get("show_plan"):
                cy += 52
                draw_rounded_rect(draw, [cx, cy, WIDTH - 24, cy + 54], 10, fill=PANEL_BG, outline=BORDER_COLOR)
                draw.ellipse([cx + 12, cy + 12, cx + 28, cy + 28], fill=ACCENT_PURPLE)
                draw.text((cx + 34, cy + 8), "Chief of Staff", fill=ACCENT_PURPLE, font=FONT_BOLD)
                draw.text((cx + 34, cy + 26), "Planning workflow: Delegating auth implementation to @Coder with CIDR safety checks.", fill=TEXT_MUTED, font=FONT_BODY)
            if step.get("show_delegation"):
                cy += 60
                draw_rounded_rect(draw, [cx + 20, cy, cx + 420, cy + 32], 8, fill=INSET_BG, outline=ACCENT_BLUE)
                draw.text((cx + 30, cy + 8), "⚡ delegate_bot(@Coder, task='Implement CIDR bypass')", fill=ACCENT_BLUE, font=FONT_SMALL_BOLD)
            if step.get("show_approval"):
                cy += 40
                status = step["show_approval"]
                card_col = SUCCESS_BG if status == "approved" else CARD_BG
                border_col = ACCENT_GREEN if status == "approved" else ACCENT_AMBER
                draw_rounded_rect(draw, [cx + 20, cy, WIDTH - 40, cy + 84], 8, fill=card_col, outline=border_col, width=2)
                draw.text((cx + 32, cy + 8), "⚠️ Peer Permission Request: Coder wants to run shell command", fill=TEXT_WHITE, font=FONT_BOLD)
                draw_rounded_rect(draw, [cx + 32, cy + 28, WIDTH - 54, cy + 50], 4, fill=CODE_BG)
                draw.text((cx + 40, cy + 33), "$ npx vitest run server/cidr.test.ts", fill=(52, 211, 153), font=FONT_CODE)
                if status == "approved":
                    draw_rounded_rect(draw, [cx + 32, cy + 56, cx + 180, cy + 76], 4, fill=ACCENT_GREEN)
                    draw.text((cx + 42, cy + 59), "✓ User Allowed (Always)", fill=TEXT_WHITE, font=FONT_SMALL_BOLD)
                else:
                    draw_rounded_rect(draw, [cx + 32, cy + 56, cx + 110, cy + 76], 4, fill=ACCENT_GREEN)
                    draw.text((cx + 46, cy + 59), "Allow", fill=TEXT_WHITE, font=FONT_SMALL_BOLD)
                    draw_rounded_rect(draw, [cx + 120, cy + 56, cx + 210, cy + 76], 4, fill=CARD_BG, outline=BORDER_COLOR)
                    draw.text((cx + 128, cy + 59), "Always allow", fill=TEXT_MUTED, font=FONT_SMALL_BOLD)
            if step.get("show_done"):
                cy += 94
                draw_rounded_rect(draw, [cx, cy, WIDTH - 24, cy + 46], 10, fill=PANEL_BG, outline=ACCENT_GREEN)
                draw.ellipse([cx + 12, cy + 10, cx + 28, cy + 26], fill=ACCENT_PURPLE)
                draw.text((cx + 34, cy + 6), "Chief of Staff", fill=ACCENT_PURPLE, font=FONT_BOLD)
                draw.text((cx + 34, cy + 24), "All 14 CIDR unit tests passed & auth bypass active on 10.0.0.0/24.", fill=TEXT_WHITE, font=FONT_BODY)
            frames.append(img)
    frames[0].save(output_path, save_all=True, append_images=frames[1:], duration=1200, loop=0, optimize=True)
    print(f"Generated {output_path}")

def create_computer_walkthrough(output_path):
    frames = []
    steps = [
        {"title": "1. Prompting Autonomous Shell Task", "cmd": "execute_shell_cmd", "arg": "git status && npm run test", "out": ""},
        {"title": "2. Agent Invokes execute_shell_cmd", "cmd": "execute_shell_cmd", "arg": "git status && npm run test", "out": "Running sandbox command on host..."},
        {"title": "3. Streaming Terminal Output in Real-Time", "cmd": "execute_shell_cmd", "arg": "git status && npm run test", "out": "On branch main\nChanges to be committed: server/cidr.ts\n✓ 966 tests passed (100%) in 90.4s"},
        {"title": "4. Observing Browser & UI State", "cmd": "observe_screen", "arg": "capture_viewport()", "out": "Captured 1920x1080 desktop frame [100% fidelity]"},
        {"title": "5. Task Settled with Zero Errors", "cmd": "done", "arg": "exit code 0", "out": "✓ Successfully executed all verification steps."},
    ]
    for i, s in enumerate(steps):
        repeat = 3 if i != len(steps)-1 else 5
        for _ in range(repeat):
            img = Image.new("RGB", (WIDTH, HEIGHT), BG_DARK)
            draw = ImageDraw.Draw(img)
            draw_header(draw, "Headless Computer Automation", "")
            draw_sidebar(draw, "Coder")
            cx = 216
            cy = 60
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 28], 6, fill=PANEL_BG, outline=BORDER_COLOR)
            draw.text((cx + 12, cy + 6), s["title"], fill=ACCENT_GREEN, font=FONT_SMALL_BOLD)
            cy += 38
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 340], 8, fill=INSET_BG, outline=BORDER_COLOR)
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 30], 8, fill=PANEL_BG)
            draw.ellipse([cx + 10, cy + 10, cx + 18, cy + 18], fill=(239, 68, 68))
            draw.ellipse([cx + 24, cy + 10, cx + 32, cy + 18], fill=(245, 158, 11))
            draw.ellipse([cx + 38, cy + 10, cx + 46, cy + 18], fill=(16, 185, 129))
            draw.text((cx + 60, cy + 7), "Terminal — execute_shell_cmd", fill=TEXT_MUTED, font=FONT_SMALL_BOLD)
            tcy = cy + 40
            draw_rounded_rect(draw, [cx + 12, tcy, cx + 380, tcy + 26], 6, fill=CARD_BG, outline=ACCENT_BLUE)
            draw.text((cx + 20, tcy + 5), f"> {s['cmd']}({s['arg']})", fill=ACCENT_BLUE, font=FONT_CODE)
            tcy += 36
            if s["out"]:
                for line in s["out"].split("\n"):
                    col = ACCENT_GREEN if "✓" in line or "Success" in line else TEXT_WHITE
                    draw.text((cx + 16, tcy), line, fill=col, font=FONT_CODE)
                    tcy += 20
            draw_rounded_rect(draw, [cx + 16, tcy, cx + 24, tcy + 14], 2, fill=ACCENT_BLUE)
            frames.append(img)
    frames[0].save(output_path, save_all=True, append_images=frames[1:], duration=1200, loop=0, optimize=True)
    print(f"Generated {output_path}")

def create_voice_walkthrough(output_path):
    frames = []
    steps = [
        {"title": "1. Push-To-Talk Activated (Space / Mic)", "state": "listening", "wave": True, "text": "Listening to user speech..."},
        {"title": "2. Speech Recognized & Streamed", "state": "processing", "wave": False, "text": '"Summarize the latest server benchmarks"'},
        {"title": "3. ElevenLabs / OpenAI Neural Voice Synthesis", "state": "synthesizing", "wave": True, "text": "Synthesizing stream: 24kHz Opus/MP3 audio"},
        {"title": "4. Audio Waveform Playback Active", "state": "speaking", "wave": True, "text": "🔊 Bot speaking: 'Server benchmarks show 966 passing tests in 90.4s.'"},
    ]
    for i, s in enumerate(steps):
        repeat = 3 if i != len(steps)-1 else 5
        for f_idx in range(repeat):
            img = Image.new("RGB", (WIDTH, HEIGHT), BG_DARK)
            draw = ImageDraw.Draw(img)
            draw_header(draw, "Voice Mode & Neural TTS", "")
            draw_sidebar(draw, "Architect")
            cx = 216
            cy = 60
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 28], 6, fill=PANEL_BG, outline=BORDER_COLOR)
            draw.text((cx + 12, cy + 6), s["title"], fill=ACCENT_AMBER, font=FONT_SMALL_BOLD)
            cy += 40
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 240], 12, fill=PANEL_BG, outline=BORDER_COLOR)
            draw_rounded_rect(draw, [cx + 20, cy + 16, cx + 140, cy + 42], 14, fill=INSET_BG, outline=ACCENT_BLUE)
            draw.ellipse([cx + 28, cy + 25, cx + 36, cy + 33], fill=ACCENT_GREEN if s['state'] in ['listening', 'speaking'] else ACCENT_AMBER)
            draw.text((cx + 44, cy + 22), s['state'].upper(), fill=TEXT_WHITE, font=FONT_SMALL_BOLD)
            wy = cy + 100
            if s["wave"]:
                for bar in range(30):
                    bx = cx + 80 + bar * 14
                    phase = (f_idx * 0.8) + (bar * 0.4)
                    h = int(12 + 30 * abs(math.sin(phase)))
                    draw_rounded_rect(draw, [bx, wy - h, bx + 8, wy + h], 4, fill=ACCENT_BLUE if s['state']=='listening' else ACCENT_GREEN)
            draw.text((cx + 40, cy + 170), s["text"], fill=TEXT_WHITE, font=FONT_HEADING)
            cy += 256
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 60], 10, fill=CARD_BG, outline=BORDER_COLOR)
            draw_rounded_rect(draw, [cx + 16, cy + 14, cx + 180, cy + 46], 8, fill=ACCENT_BLUE)
            draw.text((cx + 30, cy + 22), "🎙️ Push To Talk (Hold)", fill=TEXT_WHITE, font=FONT_SMALL_BOLD)
            draw_rounded_rect(draw, [cx + 196, cy + 14, cx + 340, cy + 46], 8, fill=INSET_BG, outline=BORDER_COLOR)
            draw.text((cx + 210, cy + 22), "Voice: Alloy (OpenAI)", fill=TEXT_MUTED, font=FONT_SMALL)
            frames.append(img)
    frames[0].save(output_path, save_all=True, append_images=frames[1:], duration=1200, loop=0, optimize=True)
    print(f"Generated {output_path}")

def create_mcp_walkthrough(output_path):
    frames = []
    steps = [
        {"title": "1. Open Plugins & MCP Hub", "active_tab": "custom", "server_name": "", "status": "idle"},
        {"title": "2. Configure Custom MCP Endpoint & Headers", "active_tab": "custom", "server_name": "db-tools", "status": "typing"},
        {"title": "3. Server Verification & Connection OK", "active_tab": "custom", "server_name": "db-tools", "status": "verified"},
        {"title": "4. Composio SaaS Marketplace (GitHub, Slack, Jira)", "active_tab": "marketplace", "server_name": "github", "status": "connected"},
    ]
    for i, s in enumerate(steps):
        repeat = 3 if i != len(steps)-1 else 5
        for _ in range(repeat):
            img = Image.new("RGB", (WIDTH, HEIGHT), BG_DARK)
            draw = ImageDraw.Draw(img)
            draw_header(draw, "Custom MCP & SaaS Marketplace", "")
            draw_sidebar(draw, "Architect")
            cx = 216
            cy = 60
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 28], 6, fill=PANEL_BG, outline=BORDER_COLOR)
            draw.text((cx + 12, cy + 6), s["title"], fill=ACCENT_PURPLE, font=FONT_SMALL_BOLD)
            cy += 40
            draw_rounded_rect(draw, [cx, cy, WIDTH - 16, cy + 340], 12, fill=PANEL_BG, outline=BORDER_COLOR)
            draw_rounded_rect(draw, [cx + 16, cy + 14, cx + 140, cy + 42], 6, fill=CARD_BG if s['active_tab']=='custom' else INSET_BG)
            draw.text((cx + 28, cy + 22), "Custom MCP", fill=TEXT_WHITE if s['active_tab']=='custom' else TEXT_MUTED, font=FONT_BOLD)
            draw_rounded_rect(draw, [cx + 150, cy + 14, cx + 290, cy + 42], 6, fill=CARD_BG if s['active_tab']=='marketplace' else INSET_BG)
            draw.text((cx + 162, cy + 22), "SaaS Marketplace", fill=TEXT_WHITE if s['active_tab']=='marketplace' else TEXT_MUTED, font=FONT_BOLD)
            mcy = cy + 56
            if s['active_tab'] == 'custom':
                draw.text((cx + 20, mcy), "Server Name", fill=TEXT_MUTED, font=FONT_SMALL)
                draw_rounded_rect(draw, [cx + 20, mcy + 18, cx + 280, mcy + 48], 6, fill=INSET_BG, outline=ACCENT_BLUE if s['status']!='idle' else BORDER_COLOR)
                draw.text((cx + 30, mcy + 26), s['server_name'] or "e.g. sqlite-db", fill=TEXT_WHITE if s['server_name'] else TEXT_DIM, font=FONT_BODY)
                draw.text((cx + 300, mcy), "Transport URL", fill=TEXT_MUTED, font=FONT_SMALL)
                draw_rounded_rect(draw, [cx + 300, mcy + 18, WIDTH - 36, mcy + 48], 6, fill=INSET_BG, outline=BORDER_COLOR)
                draw.text((cx + 310, mcy + 26), "https://api.internal/mcp" if s['server_name'] else "https://...", fill=TEXT_WHITE if s['server_name'] else TEXT_DIM, font=FONT_BODY)
                mcy += 60
                draw.text((cx + 20, mcy), "Secret Headers (Authorization)", fill=TEXT_MUTED, font=FONT_SMALL)
                draw_rounded_rect(draw, [cx + 20, mcy + 18, WIDTH - 36, mcy + 48], 6, fill=INSET_BG, outline=BORDER_COLOR)
                draw.text((cx + 30, mcy + 26), "Bearer ********************************" if s['server_name'] else "Header key=value", fill=TEXT_WHITE if s['server_name'] else TEXT_DIM, font=FONT_BODY)
                mcy += 70
                if s['status'] == 'verified':
                    draw_rounded_rect(draw, [cx + 20, mcy, cx + 260, mcy + 34], 6, fill=SUCCESS_BG, outline=ACCENT_GREEN)
                    draw.text((cx + 30, mcy + 8), "✓ 8 Tools Discovered & Ready", fill=SUCCESS_TEXT, font=FONT_SMALL_BOLD)
                draw_rounded_rect(draw, [WIDTH - 140, cy + 285, WIDTH - 36, cy + 320], 8, fill=ACCENT_BLUE)
                draw.text((WIDTH - 110, cy + 295), "Save Server", fill=TEXT_WHITE, font=FONT_BOLD)
            else:
                cards = [
                    ("GitHub", "Issues, PRs, Commits", True),
                    ("Slack", "Channels & Direct Messages", True),
                    ("Jira", "Sprint tickets & issues", False),
                    ("PostgreSQL", "Database queries & schemas", True),
                ]
                grid_y = mcy
                for name, desc, connected in cards:
                    draw_rounded_rect(draw, [cx + 20, grid_y, WIDTH - 36, grid_y + 50], 8, fill=INSET_BG, outline=BORDER_COLOR)
                    draw.text((cx + 36, grid_y + 10), name, fill=TEXT_WHITE, font=FONT_BOLD)
                    draw.text((cx + 36, grid_y + 28), desc, fill=TEXT_MUTED, font=FONT_SMALL)
                    btn_col = ACCENT_GREEN if connected else ACCENT_BLUE
                    draw_rounded_rect(draw, [WIDTH - 140, grid_y + 12, WIDTH - 50, grid_y + 38], 6, fill=btn_col)
                    draw.text((WIDTH - 130, grid_y + 18), "Connected" if connected else "Connect", fill=TEXT_WHITE, font=FONT_SMALL_BOLD)
                    grid_y += 58
            frames.append(img)
    frames[0].save(output_path, save_all=True, append_images=frames[1:], duration=1200, loop=0, optimize=True)
    print(f"Generated {output_path}")

if __name__ == "__main__":
    os.makedirs("docs/walkthroughs", exist_ok=True)
    create_multibot_walkthrough("docs/walkthroughs/multibot-delegation.gif")
    create_computer_walkthrough("docs/walkthroughs/computer-automation.gif")
    create_voice_walkthrough("docs/walkthroughs/voice-tts.gif")
    create_mcp_walkthrough("docs/walkthroughs/mcp-marketplace.gif")
    print("All walkthrough GIFs generated successfully!")
