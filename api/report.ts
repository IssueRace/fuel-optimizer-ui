import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { origin, destination, distance, cost, stops, fuelType, consumption, capacity, isPossible, stoppedAtKm } = req.body;

    // Build a simple PDF manually (PDF 1.4 spec)
    const lines: string[] = [];
    lines.push('Road Trip Fuel Cost Report');
    lines.push('');
    lines.push(`Route: ${origin} -> ${destination}`);
    lines.push(`Total Distance: ${distance?.toFixed(1)} km`);
    lines.push(`Estimated Cost: EUR ${cost?.toFixed(2)}`);
    lines.push(`Fuel Type: ${fuelType}`);
    lines.push(`Consumption: ${consumption} ${fuelType === 'Electric' ? 'kWh' : 'L'}/100km`);
    lines.push(`Tank/Battery: ${capacity} ${fuelType === 'Electric' ? 'kWh' : 'L'}`);
    lines.push(`Route Possible: ${isPossible ? 'Yes' : 'No'}`);
    if (!isPossible) {
      lines.push(`Vehicle stopped at: ${stoppedAtKm?.toFixed(1)} km`);
    }
    lines.push('');
    lines.push(`Recommended Fuel Stops (${stops?.length || 0}):`);
    lines.push('---');
    
    if (stops && stops.length > 0) {
      stops.forEach((stop: any, i: number) => {
        lines.push(`${i + 1}. ${stop.stationName}`);
        lines.push(`   Price: EUR ${stop.pricePerLiter}/L`);
        lines.push(`   Refuel: ${stop.amountToRefuel} L`);
        lines.push(`   Location: ${stop.latitude?.toFixed(4)}, ${stop.longitude?.toFixed(4)}`);
        lines.push('');
      });
    }

    lines.push('---');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('Powered by FuelOptimizer - Road Trip Fuel Cost Optimizer');

    // Create a raw PDF
    const textContent = lines.join('\n');
    const pdfContent = buildPdf(textContent, lines);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="trip-report.pdf"`);
    return res.send(Buffer.from(pdfContent));
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'PDF generation failed' });
  }
}

function buildPdf(fullText: string, lines: string[]): Uint8Array {
  // Minimal valid PDF with text content
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const margin = 50;
  const lineHeight = 16;
  const fontSize = 11;
  const titleFontSize = 18;
  
  let yPos = pageHeight - margin;
  const contentLines: string[] = [];
  
  for (const line of lines) {
    const escaped = line
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, '?'); // ASCII only for PDF compatibility
    
    const isTitle = contentLines.length === 0;
    const fs = isTitle ? titleFontSize : fontSize;
    const lh = isTitle ? 24 : lineHeight;
    
    contentLines.push(`BT /F1 ${fs} Tf ${margin} ${yPos} Td (${escaped}) Tj ET`);
    yPos -= lh;
    
    if (yPos < margin) break; // Don't overflow page
  }
  
  const stream = contentLines.join('\n');
  
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`;
  const obj4 = `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj';
  
  const body = `${obj1}\n${obj2}\n${obj3}\n${obj4}\n${obj5}`;
  const header = '%PDF-1.4\n';
  
  // Calculate xref offsets
  let offset = header.length;
  const offsets: number[] = [];
  const objects = [obj1, obj2, obj3, obj4, obj5];
  for (const obj of objects) {
    offsets.push(offset);
    offset += obj.length + 1; // +1 for newline
  }
  
  const xrefStart = offset;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  
  const fullPdf = `${header}${body}\n${xref}${trailer}`;
  return new TextEncoder().encode(fullPdf);
}
