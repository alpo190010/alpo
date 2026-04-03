"use client";

const EZ = "cubic-bezier(.4,0,.2,1)";

const KEYFRAMES = `
@keyframes alpo-st{
0%,15%{d:path("M106 102 L114.5 110.5");opacity:1}
35%,65%{d:path("M106 102 L106 102");opacity:0}
85%,100%{d:path("M106 102 L114.5 110.5");opacity:1}
}
@keyframes alpo-rg{
0%,15%{stroke-width:3;r:32}
35%,65%{stroke-width:6.5;r:36}
85%,100%{stroke-width:3;r:32}
}
@keyframes alpo-fg{
0%,15%{fill-opacity:0.05;r:32}
35%,65%{fill-opacity:0.14;r:36}
85%,100%{fill-opacity:0.05;r:32}
}
@keyframes alpo-mouth{
0%,15%{d:path("M74 90 Q82 90.5 90 90")}
35%,65%{d:path("M74 90 Q82 98 90 90")}
85%,100%{d:path("M74 90 Q82 90.5 90 90")}
}
@keyframes alpo-eyeL{
0%{cx:73}4%{cx:70}8%{cx:76}13%,35%{cx:73}65%,85%{cx:73}89%{cx:70}93%{cx:76}98%,100%{cx:73}
}
@keyframes alpo-eyeR{
0%{cx:91}4%{cx:88}8%{cx:94}13%,35%{cx:91}65%,85%{cx:91}89%{cx:88}93%{cx:94}98%,100%{cx:91}
}
@keyframes alpo-hlL{
0%,2%{cx:74;cy:74}7%{cx:73;cy:74}14%{cx:75;cy:74}20%,30%{cx:74;cy:74}35%,65%{cx:74;cy:72}80%,100%{cx:74;cy:74}
}
@keyframes alpo-hlR{
0%,2%{cx:92;cy:74}7%{cx:91;cy:74}14%{cx:93;cy:74}20%,30%{cx:92;cy:74}35%,65%{cx:92;cy:72}80%,100%{cx:92;cy:74}
}
@keyframes alpo-blink{
0%,42%,46%,100%{r:3.5}44%{r:0.5}
}
@keyframes alpo-colorA{
0%,15%{stop-color:#1d1c28}35%,65%{stop-color:#2563eb}85%,100%{stop-color:#1d1c28}
}
@keyframes alpo-colorB{
0%,15%{stop-color:#1d1c28}35%,65%{stop-color:#4f46e5}85%,100%{stop-color:#1d1c28}
}
@keyframes alpo-pulse{
0%,28%{transform:scale(1)}38%{transform:scale(1.02)}48%{transform:scale(1)}58%{transform:scale(1.02)}68%{transform:scale(1)}75%,100%{transform:scale(1)}
}
@keyframes alpo-glow{
0%,28%{stroke-width:4;opacity:0}38%{stroke-width:7;opacity:0.18}48%{stroke-width:4;opacity:0.06}58%{stroke-width:7;opacity:0.18}68%{stroke-width:4;opacity:0.06}75%,100%{stroke-width:4;opacity:0}
}
`;

export default function AlpoLogo({width = 32, height = 32}: { width?: number, height?: number }) {
    const a = (name: string, dur: string) =>
        `${name} ${dur} ${EZ} infinite`;

    return (
        <>
            <style dangerouslySetInnerHTML={{__html: KEYFRAMES}}/>
            <svg width={width} height={height} viewBox="0 0 164 164">
                <defs>
                    <linearGradient id="alpo-g" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style={{animation: a("alpo-colorA", "10s")}}/>
                        <stop offset="100%" style={{animation: a("alpo-colorB", "10s")}}/>
                    </linearGradient>
                    <filter id="alpo-blur">
                        <feGaussianBlur stdDeviation="4"/>
                    </filter>
                </defs>
                <g style={{transformOrigin: "82px 78px", animation: a("alpo-pulse", "10s")}}>
                    <circle cx="82" cy="78" r="36" fill="none" stroke="url(#alpo-g)" strokeWidth="6"
                            filter="url(#alpo-blur)" opacity="0" style={{animation: a("alpo-glow", "10s")}}/>
                    <circle cx="82" cy="78" r="32" fill="url(#alpo-g)" style={{animation: a("alpo-fg", "10s")}}/>
                    <circle cx="82" cy="78" r="32" fill="none" stroke="url(#alpo-g)"
                            style={{animation: a("alpo-rg", "10s")}}/>
                    <path d="M106 102 L114.5 110.5" fill="none" stroke="url(#alpo-g)" strokeWidth="5"
                          strokeLinecap="round" style={{animation: a("alpo-st", "10s")}}/>
                    <circle cx="73" cy="74" r="3.5" fill="url(#alpo-g)" style={{animation: a("alpo-blink", "4s")}}/>
                    <circle cx="91" cy="74" r="3.5" fill="url(#alpo-g)" style={{animation: a("alpo-blink", "4s")}}/>
                    <circle cx="74" cy="74" r="0.9" fill="#fff" style={{animation: a("alpo-hlL", "10s")}}/>
                    <circle cx="92" cy="74" r="0.9" fill="#fff" style={{animation: a("alpo-hlR", "10s")}}/>
                    <path d="M74 90 Q82 90.5 90 90" fill="none" stroke="url(#alpo-g)" strokeWidth="3"
                          strokeLinecap="round" style={{animation: a("alpo-mouth", "10s")}}/>
                </g>
            </svg>
        </>
    );
}
