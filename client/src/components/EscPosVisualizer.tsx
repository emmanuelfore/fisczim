import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface EscPosVisualizerProps {
    data: Uint8Array;
}

export const EscPosVisualizer: React.FC<EscPosVisualizerProps> = ({ data }) => {
    const lines: any[] = [];
    let currentAlign = 'left';
    let isDoubleHeight = false;
    let isDoubleWidth = false;
    let isBold = false;
    let isItalic = false;
    let currentLine = "";
    
    let i = 0;
    while (i < data.length) {
        const b = data[i];
        
        // ── ESC Commands (0x1B) ──
        if (b === 0x1b) {
            const next = data[i + 1];
            if (next === 0x40) { i += 2; continue; }
            if (next === 0x61) {
                const align = data[i + 2];
                currentAlign = align === 1 ? 'center' : (align === 2 ? 'right' : 'left');
                i += 3; continue;
            }
            if (next === 0x45) { isBold = data[i + 2] === 1; i += 3; continue; }
            if (next === 0x34) { isItalic = data[i + 2] === 1; i += 3; continue; }
            if (next === 0x70) { i += 5; continue; }
            i++; continue;
        }

        // ── GS Commands (0x1D) ──
        if (b === 0x1d) {
            const next = data[i + 1];
            if (next === 0x21) {
                const size = data[i + 2];
                isDoubleHeight = (size & 0x01) > 0;
                isDoubleWidth = (size & 0x10) > 0;
                i += 3; continue;
            }
            if (next === 0x28 && data[i+2] === 0x6b) {
                const pL = data[i+3];
                const pH = data[i+4];
                const len = pL + (pH * 256);
                
                // Function 180: Store data (this contains the actual QR string)
                if (data[i+5] === 0x31 && data[i+6] === 0x50 && data[i+7] === 0x30) {
                    const qrDataBytes = data.slice(i+8, i+8 + (len - 3));
                    const qrText = new TextDecoder().decode(qrDataBytes);
                    lines.push({ type: 'qr', data: qrText, align: currentAlign });
                }
                
                i += (len + 5); 
                continue;
            }
            if (next === 0x56) { i += 3; continue; }
            i++; continue; 
        }

        // ── LF/CR Commands ──
        if (b === 0x0a || b === 0x0d) {
            lines.push({ 
                type: 'text', 
                content: currentLine, 
                align: currentAlign, 
                bold: isBold || isDoubleWidth, 
                italic: isItalic,
                scale: isDoubleHeight ? 1.5 : 1 
            });
            currentLine = "";
            i++; continue;
        }

        if (b >= 32 && b <= 126) {
            currentLine += String.fromCharCode(b);
        }
        i++;
    }

    return (
        <div className="bg-[#fcf8f2] p-4 text-black font-mono text-[10px] leading-tight shadow-inner min-h-[500px] w-full max-w-[350px] border border-slate-200">
            <div className="bg-white p-6 min-h-full border-x border-slate-100 shadow-sm relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-b from-slate-100 to-transparent opacity-50" />
                
                {lines.map((line, idx) => {
                    if (line.type === 'qr') {
                        return (
                            <div key={idx} className={`flex ${line.align === 'center' ? 'justify-center' : (line.align === 'right' ? 'justify-end' : 'justify-start')} my-6`}>
                                <div className="p-2 bg-white border border-slate-100 shadow-md rounded-lg">
                                    <QRCodeCanvas value={line.data} size={112} level="M" />
                                    <p className="text-[6px] text-slate-400 mt-1 font-black text-center uppercase tracking-tighter">Scan for ZIMRA Verification</p>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <p key={idx} 
                           className={`whitespace-pre-wrap break-words min-h-[1em] ${line.align === 'center' ? 'text-center' : (line.align === 'right' ? 'text-right' : 'text-left')} ${line.bold ? 'font-black' : 'font-medium'} ${line.italic ? 'italic' : ''} mb-0`}
                           style={{ fontSize: `${line.scale * 10}px` }}
                        >
                            {line.content || " "}
                        </p>
                    );
                })}
                <div className="h-10 border-t border-dashed border-slate-200 mt-8 relative">
                   <div className="absolute top-4 left-0 w-full text-center opacity-20 text-[8px] font-black uppercase tracking-[0.3em]">End of Receipt</div>
                </div>
            </div>
        </div>
    );
};
