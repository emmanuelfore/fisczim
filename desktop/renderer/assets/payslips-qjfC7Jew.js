import{e as oe,a as K,j as e,L as V}from"./vendor-DGnf-lJo.js";import{u as ce,a as me,b as xe,c as he,d as W,B as o,A as ue,L as Q,M as X,C as g,e as w,f as $,g as D,h as J,i as be,j as pe,k as ye}from"./index-CVk_DIMv.js";import{H as L,F as ee}from"./layout-ChYL_0NC.js";import{T as ve,a as ge,b as z,c as x,d as fe,e as c}from"./table-C6GFbt0q.js";import{d as S}from"./export-utils-DAZL7K4G.js";import{P as je}from"./page-skeleton-N291n_2G.js";import{j as Ne,a as ke,S as f}from"./jurisdictions-DNFqiZZy.js";import{f as R}from"./format-CHU2YbEi.js";import{P as we}from"./printer-BkyUgZnW.js";import{D as M}from"./download-BU7dGPLS.js";import{F as $e}from"./use-products-C3DuZbyp.js";import{B as De}from"./banknote-BWIZ95pR.js";import{L as Se}from"./landmark-BRirWN0W.js";import{T as Pe}from"./layout-CMXAT3pG.js";import"./ui-u2xTLqBJ.js";import"./chart-pie-Ja1CpyGd.js";import"./en-US-DKRDJqXz.js";import"./constructFrom-rJN6zrQ_.js";import"./startOfDay-BKq3QRE6.js";import"./map-pin-C5D4zscz.js";import"./utensils-Bpe8Dy4s.js";import"./receipt-CbqF1gya.js";function n(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}const te=s=>{const u=Number(s??0);return Number.isFinite(u)?u:0},h=s=>Math.round(te(s)*100),P=s=>s/100,ae="Tax table not recorded on this run";function Qe(){const{runId:s}=oe(),{activeCompany:u}=ce(),m=u?.id,B=me(),{data:_,isLoading:se}=xe({queryKey:[`/api/companies/${m}/payroll/runs/${s}/payslips`],enabled:!!m&&!!s}),[j,le]=K.useState(null),[b,F]=K.useState(null),{toast:Y}=he();if(se)return e.jsx(L,{children:e.jsx(je,{})});if(!_?.run)return e.jsx(L,{children:e.jsx("div",{className:"p-8 text-center text-muted-foreground",children:"Run not found."})});const{run:r,payslips:p}=_,re=Ne(u?.country),v=a=>ke(re,a),i=a=>J(a,W(r.currency)),E=String(r.periodEnd).slice(0,4),N=W(r.currency),I=`Year to date · ${E} · ${N}`,T=a=>{const t=a.runData,l=[{label:`PAYE (${B.authorityShortName})`,value:t.paye}];return v(f.nssaPobs)&&l.push({label:"NSSA",value:t.nssaEmployee}),v(f.aidsLevy)&&l.push({label:"AIDS Levy",value:t.aidsLevy}),v(f.nec)&&l.push({label:"NEC (Employee)",value:t.necEmployee}),v(f.pension)&&l.push({label:"Pension (Employee)",value:t.pensionEmployee}),l},A=a=>{const t=T(a).reduce((l,d)=>l+h(d.value),0);return P(h(a.runData.totalDeductions)-t)},C=a=>P(h(a.runData.grossSalary)-h(a.runData.basicSalary)),H=a=>P(h(a.runData.paye)+(v(f.aidsLevy)?h(a.runData.aidsLevy):0)),ie=P(p.reduce((a,t)=>a+h(H(t)),0)),O=["APPROVED","LOCKED"].includes(r.status),G=a=>{const t=k=>n(i(k)),l=T(a),d=A(a),y=te(a.runData.netSalaryZig),q=C(a);return`
      <div class="payslip">
        <div class="header">
          <h1 class="title">PAYSLIP</h1>
          <p class="company">${n(u?.name||"Company Name")}</p>
          <p class="company">${n(R(new Date(r.periodStart),"MMMM yyyy"))}</p>
        </div>

        <div class="grid">
          <div class="col">
            <div class="label">Employee Name</div>
            <div class="value">${n(`${a.employee.firstName} ${a.employee.lastName}`)}</div>
            <div class="label">Employee ID</div>
            <div class="value">${n(a.employee.employeeNumber)}</div>
          </div>
          <div class="col">
            <div class="label">National ID</div>
            <div class="value">${n(a.employee.nationalId||"-")}</div>
            <div class="label">Bank Account</div>
            <div class="value">${n(`${a.employee.bankName||"-"} (${a.employee.bankAccountNumber||"-"})`)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Earnings</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Salary</td>
              <td class="amount">${t(a.runData.basicSalary)}</td>
            </tr>
            ${q>0?`
            <tr>
              <td>Allowances</td>
              <td class="amount">${t(q)}</td>
            </tr>`:""}
            <tr class="total-row">
              <td>Gross Earnings</td>
              <td class="amount">${t(a.runData.grossSalary)}</td>
            </tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr>
              <th>Deductions</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${l.map(k=>`
            <tr>
              <td>${n(k.label)}</td>
              <td class="amount">${t(k.value)}</td>
            </tr>`).join("")}
            ${Math.abs(d)>.004?`
            <tr>
              <td>Other Deductions</td>
              <td class="amount">${t(d)}</td>
            </tr>`:""}
            <tr class="total-row">
              <td>Total Deductions</td>
              <td class="amount">${t(a.runData.totalDeductions)}</td>
            </tr>
          </tbody>
        </table>

        <div class="net-pay">
          Net Pay: ${t(a.runData.netSalary)}
        </div>
        ${r.currency==="SPLIT"&&y>0?`
        <div class="split">
          Paid in two currencies: ${t(a.runData.netSalaryUsd)} and ${n(J(y,"ZWG"))}
        </div>`:""}

        <div class="ytd">
          <div class="ytd-title">${n(I)}${a.ytd?` — ${a.ytd.runs} run${a.ytd.runs===1?"":"s"}`:""}</div>
          ${a.ytd?`
          <div class="grid">
            <div class="col">
              <div class="label">Gross</div>
              <div class="value">${t(a.ytd.gross)}</div>
            </div>
            <div class="col">
              <div class="label">PAYE</div>
              <div class="value">${t(a.ytd.paye)}</div>
            </div>
            <div class="col">
              <div class="label">NSSA</div>
              <div class="value">${t(a.ytd.nssa)}</div>
            </div>
            <div class="col">
              <div class="label">AIDS levy</div>
              <div class="value">${t(a.ytd.aids)}</div>
            </div>
            <div class="col">
              <div class="label">Net</div>
              <div class="value">${t(a.ytd.net)}</div>
            </div>
          </div>`:`
          <div class="ytd-empty">There is no year-to-date history in ${n(N)} for the ${n(E)} tax year yet - this is the earliest run of the year on record.</div>`}
        </div>

        <div class="tax-table${a.taxTableLabel===ae?" tax-table-unrecorded":""}">
          Tax table used for this month's PAYE: ${n(a.taxTableLabel)}
        </div>

        <div class="signoff">
          <div class="sig">
            <div class="sig-line"></div>
            <div class="sig-label">Received by (name and signature)</div>
          </div>
          <div class="sig">
            <div class="sig-line"></div>
            <div class="sig-label">Date</div>
          </div>
        </div>
      </div>
    `},U=(a,t)=>{const l=window.open("","_blank");if(!l)return;const d=`
      <html>
        <head>
          <title>${n(t)}</title>
          <style>
            body { font-family: system-ui, sans-serif; line-height: 1.5; padding: 40px; color: #1e293b; }
            .payslip { margin: 0 0 40px 0; }
            .payslip + .payslip { page-break-before: always; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin: 0 0 10px 0; }
            .company { font-size: 18px; color: #64748b; margin: 0; }
            .grid { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .col { flex: 1; }
            .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
            .value { font-size: 16px; font-weight: 500; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
            th { font-size: 13px; text-transform: uppercase; color: #64748b; font-weight: 600; background: #f8fafc; }
            .amount { text-align: right; }
            .total-row { font-weight: bold; font-size: 16px; background: #f8fafc; }
            .net-pay { font-size: 20px; font-weight: bold; color: #0f172a; text-align: right; margin-top: 20px; padding: 20px; background: #f1f5f9; border-radius: 8px; }
            .split { font-size: 14px; color: #475569; text-align: right; margin-top: 8px; }
            .ytd { margin-top: 30px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; }
            .ytd-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
            .ytd .grid { margin-bottom: 0; }
            .ytd .value { margin-bottom: 0; font-size: 14px; }
            .ytd-empty { font-size: 13px; color: #64748b; }
            .tax-table { font-size: 12px; color: #64748b; margin-top: 16px; }
            .tax-table-unrecorded { color: #b45309; font-weight: 600; }
            .signoff { display: flex; justify-content: space-between; gap: 60px; margin-top: 56px; }
            .sig { flex: 1; }
            .sig-line { border-bottom: 1px solid #475569; height: 32px; }
            .sig-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${a}
        </body>
      </html>
    `;l.document.write(d),l.document.close(),setTimeout(()=>{l.print()},500)},ne=a=>{U(G(a),`Payslip - ${a.employee.firstName} ${a.employee.lastName}`)},de=()=>{const a=p.map(t=>G(t)).join(`
`);U(a,`Payslips - ${r.periodStart} to ${r.periodEnd}`)},Z=async a=>{const t=a?a.length:p.length;if(t&&window.confirm(a?`Email this payslip (${t})?`:`Email ${t} payslip${t===1?"":"s"} to all employees with a registered email address?`)){F(a||"all");try{const d=await(await ye("POST",`/api/companies/${m}/payroll/runs/${s}/email-payslips`,{employeeIds:a})).json(),y=[`Sent: ${d.sent.length}`];d.skipped.length&&y.push(`skipped ${d.skipped.length} (no email)`),d.failed.length&&y.push(`failed ${d.failed.length}`),Y({title:"Payslips emailed",description:y.join(", ")})}catch(l){Y({title:"Email failed",description:l.message||"Something went wrong",variant:"destructive"})}finally{F(null)}}};return e.jsx(L,{children:e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsx(V,{href:"/hr/payroll",children:e.jsx(o,{variant:"outline",size:"icon",className:"h-9 w-9",children:e.jsx(ue,{className:"h-4 w-4"})})}),e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold tracking-tight text-slate-900 dark:text-white",children:"Payroll Run Details"}),e.jsxs("p",{className:"text-sm text-slate-500 dark:text-slate-400",children:["Period: ",R(new Date(r.periodStart),"MMM d, yyyy")," - ",R(new Date(r.periodEnd),"MMM d, yyyy")]})]}),e.jsxs("div",{className:"ml-auto flex items-center gap-2",children:[e.jsxs(o,{variant:"outline",onClick:de,disabled:!p?.length,children:[e.jsx(we,{className:"mr-2 h-4 w-4"}),"Print All"]}),e.jsxs(o,{variant:"outline",onClick:()=>Z(),disabled:b!==null||!p?.length,children:[b==="all"?e.jsx(Q,{className:"mr-2 h-4 w-4 animate-spin"}):e.jsx(X,{className:"mr-2 h-4 w-4"}),"Email All"]}),e.jsx(V,{href:`/hr/payroll/${s}/report`,children:e.jsxs(o,{variant:"outline",className:"text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20",children:[e.jsx(ee,{className:"mr-2 h-4 w-4"}),"Run Report"]})}),e.jsxs(o,{variant:"outline",onClick:()=>{S(`/api/companies/${m}/payroll/report/csv?runId=${s}`,`payroll_report_run_${s}.csv`)},children:[e.jsx(M,{className:"mr-2 h-4 w-4"}),"Summary CSV"]}),e.jsxs(o,{onClick:()=>{S(`/api/companies/${m}/payroll/runs/${s}/bank-export`,`bank_export_${s}.csv`)},disabled:!O,title:O?"Download the payment file for the bank":"Approve or lock the run before exporting a payment file",className:"bg-blue-600 hover:bg-blue-700 text-white",children:[e.jsx(M,{className:"mr-2 h-4 w-4"}),"Export Bank File"]})]})]}),e.jsxs("div",{className:"grid gap-4 md:grid-cols-4",children:[e.jsxs(g,{className:"bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/50",children:[e.jsx(w,{className:"pb-2",children:e.jsx($,{className:"text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider",children:"Total Gross"})}),e.jsx(D,{children:e.jsx("div",{className:"text-2xl font-bold text-slate-900 dark:text-white",children:i(r.totalGross)})})]}),e.jsxs(g,{className:"bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/50",children:[e.jsx(w,{className:"pb-2",children:e.jsx($,{className:"text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider",children:"Total Taxes"})}),e.jsx(D,{children:e.jsx("div",{className:"text-2xl font-bold text-slate-900 dark:text-white",children:i(ie)})})]}),e.jsxs(g,{className:"bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/50",children:[e.jsx(w,{className:"pb-2",children:e.jsx($,{className:"text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider",children:"Total Deductions"})}),e.jsx(D,{children:e.jsx("div",{className:"text-2xl font-bold text-slate-900 dark:text-white",children:i(r.totalDeductions)})})]}),e.jsxs(g,{className:"bg-emerald-50/50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/50",children:[e.jsx(w,{className:"pb-2",children:e.jsx($,{className:"text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider",children:"Total Net Pay"})}),e.jsx(D,{children:e.jsx("div",{className:"text-2xl font-bold text-slate-900 dark:text-white",children:i(r.totalNet)})})]})]}),e.jsx(g,{className:"border-slate-200 shadow-sm overflow-hidden",children:e.jsx("div",{className:"overflow-x-auto",children:e.jsxs(ve,{children:[e.jsx(ge,{className:"bg-slate-50 dark:bg-slate-900/50",children:e.jsxs(z,{children:[e.jsx(x,{className:"w-[40px]"}),e.jsx(x,{children:"Employee"}),e.jsx(x,{children:"Role"}),e.jsx(x,{className:"text-right",children:"Gross Pay"}),e.jsx(x,{className:"text-right",children:"Taxes"}),e.jsx(x,{className:"text-right",children:"Net Pay"}),e.jsx(x,{className:"text-right pr-6",children:"Action"})]})}),e.jsx(fe,{children:p?.map(a=>e.jsxs(e.Fragment,{children:[e.jsxs(z,{className:`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50 ${j===a.runData.id?"bg-blue-50/30 dark:bg-blue-900/10":""}`,onClick:()=>le(j===a.runData.id?null:a.runData.id),children:[e.jsx(c,{children:j===a.runData.id?e.jsx(be,{className:"h-4 w-4 text-slate-500"}):e.jsx(pe,{className:"h-4 w-4 text-slate-500"})}),e.jsxs(c,{children:[e.jsxs("div",{className:"font-medium text-slate-900 dark:text-white",children:[a.employee.firstName," ",a.employee.lastName]}),e.jsx("div",{className:"text-xs text-slate-500",children:a.employee.employeeNumber})]}),e.jsx(c,{children:e.jsx("div",{className:"text-sm",children:a.employee.nationalId||"-"})}),e.jsx(c,{className:"text-right font-medium text-slate-700 dark:text-slate-300",children:i(a.runData.grossSalary)}),e.jsx(c,{className:"text-right text-red-600 dark:text-red-400",children:i(H(a))}),e.jsx(c,{className:"text-right font-bold text-emerald-600 dark:text-emerald-400",children:i(a.runData.netSalary)}),e.jsx(c,{className:"text-right pr-6",onClick:t=>t.stopPropagation(),children:e.jsxs("div",{className:"flex items-center justify-end gap-1",children:[e.jsxs(o,{variant:"ghost",size:"sm",className:"h-8 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/50 dark:hover:text-blue-400",onClick:()=>ne(a),children:[e.jsx($e,{className:"mr-2 h-4 w-4"}),"Print"]}),e.jsxs(o,{variant:"ghost",size:"sm",className:"h-8 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-400",disabled:b!==null,onClick:()=>Z([a.employee.id]),children:[b!==null&&Array.isArray(b)&&b[0]===a.employee.id?e.jsx(Q,{className:"mr-2 h-4 w-4 animate-spin"}):e.jsx(X,{className:"mr-2 h-4 w-4"}),"Email"]}),e.jsxs(o,{variant:"outline",size:"sm",className:"h-8 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20",onClick:()=>S(`/api/companies/${m}/payroll/report/payslip/${a.employee.id}?runId=${s}`,`payslip_${a.employee.employeeNumber||a.employee.id}_${r.periodStart.slice(0,7)}.pdf`),children:[e.jsx(M,{className:"mr-2 h-4 w-4"}),"PDF"]}),B.isZimbabwe&&e.jsxs(o,{variant:"ghost",size:"sm",className:"h-8 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50",title:"Download P6 annual certificate for this employee",onClick:()=>S(`/api/companies/${m}/payroll/exports/p6?taxYear=${new Date(r.periodEnd).getFullYear()}&employeeId=${a.employee.id}`,`P6_${a.employee.employeeNumber||a.employee.id}_${new Date(r.periodEnd).getFullYear()}.csv`),children:[e.jsx(ee,{className:"mr-2 h-4 w-4"}),"P6"]})]})})]},a.runData.id),j===a.runData.id&&e.jsx(z,{className:"bg-slate-50/50 dark:bg-slate-900/20 border-b-2 border-slate-200",children:e.jsx(c,{colSpan:7,className:"p-0",children:e.jsxs("div",{className:"p-6 grid grid-cols-1 md:grid-cols-3 gap-8",children:[e.jsxs("div",{children:[e.jsxs("h4",{className:"text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2",children:[e.jsx(De,{className:"mr-2 h-4 w-4 text-emerald-500"}),"Earnings Breakdown"]}),e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-slate-600 dark:text-slate-400",children:"Basic Salary"}),e.jsx("span",{className:"font-medium",children:i(a.runData.basicSalary)})]}),C(a)>0&&e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-slate-600 dark:text-slate-400",children:"Allowances & Bonuses"}),e.jsx("span",{className:"font-medium",children:i(C(a))})]}),e.jsxs("div",{className:"flex justify-between text-sm font-bold pt-2 border-t mt-2",children:[e.jsx("span",{children:"Total Gross"}),e.jsx("span",{children:i(a.runData.grossSalary)})]})]})]}),e.jsxs("div",{children:[e.jsxs("h4",{className:"text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2",children:[e.jsx(Se,{className:"mr-2 h-4 w-4 text-red-500"}),"Deductions Breakdown"]}),e.jsxs("div",{className:"space-y-3",children:[T(a).map(t=>e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-slate-600 dark:text-slate-400",children:t.label}),e.jsx("span",{className:"font-medium text-red-600",children:i(t.value)})]},t.label)),Math.abs(A(a))>.004&&e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-slate-600 dark:text-slate-400",children:"Other Deductions"}),e.jsx("span",{className:"font-medium text-red-600",children:i(A(a))})]}),e.jsxs("div",{className:"flex justify-between text-sm font-bold pt-2 border-t mt-2",children:[e.jsx("span",{children:"Total Deductions"}),e.jsx("span",{className:"text-red-600",children:i(a.runData.totalDeductions)})]}),e.jsxs("div",{className:"flex justify-between text-sm font-bold",children:[e.jsx("span",{children:"Net Pay"}),e.jsx("span",{className:"text-emerald-600",children:i(a.runData.netSalary)})]}),e.jsxs("p",{className:a.taxTableLabel===ae?"text-xs font-medium text-amber-600 dark:text-amber-400 pt-3 border-t border-slate-200/60 dark:border-slate-800":"text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200/60 dark:border-slate-800",children:["Tax table used for PAYE: ",a.taxTableLabel]})]})]}),e.jsxs("div",{children:[e.jsxs("h4",{className:"text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center border-b pb-2",children:[e.jsx(Pe,{className:"mr-2 h-4 w-4 text-blue-500"}),I]}),a.ytd?e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"text-xs text-slate-500 dark:text-slate-400",children:["Across ",a.ytd.runs," run",a.ytd.runs===1?"":"s"," in ",N,", in this run's currency only."]}),[{label:"Gross",value:a.ytd.gross},{label:"PAYE",value:a.ytd.paye},{label:"NSSA",value:a.ytd.nssa},{label:"AIDS levy",value:a.ytd.aids},{label:"Net",value:a.ytd.net}].map(t=>e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-slate-600 dark:text-slate-400",children:t.label}),e.jsx("span",{className:"font-medium",children:i(t.value)})]},t.label))]}):e.jsxs("p",{className:"text-sm text-slate-500 dark:text-slate-400",children:["There is no year-to-date history in ",N," for the ",E," tax year yet — this is the earliest run of the year on record."]})]})]})})})]}))})]})})})]})})}export{Qe as default};
