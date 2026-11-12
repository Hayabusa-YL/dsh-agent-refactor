import React, { useState, useEffect, useMemo, useCallback } from 'react';

const STATUS = ['active', 'pending', 'disabled'];

export default function GiantDashboard() {
  const [filter1, setFilter1] = useState('');
  const [page1, setPage1] = useState(1);
  const [filter2, setFilter2] = useState('');
  const [page2, setPage2] = useState(1);
  const [filter3, setFilter3] = useState('');
  const [page3, setPage3] = useState(1);
  const [filter4, setFilter4] = useState('');
  const [page4, setPage4] = useState(1);
  const [filter5, setFilter5] = useState('');
  const [page5, setPage5] = useState(1);
  const [filter6, setFilter6] = useState('');
  const [page6, setPage6] = useState(1);
  const [filter7, setFilter7] = useState('');
  const [page7, setPage7] = useState(1);
  const [filter8, setFilter8] = useState('');
  const [page8, setPage8] = useState(1);
  const [filter9, setFilter9] = useState('');
  const [page9, setPage9] = useState(1);
  const [filter10, setFilter10] = useState('');
  const [page10, setPage10] = useState(1);
  const [filter11, setFilter11] = useState('');
  const [page11, setPage11] = useState(1);
  const [filter12, setFilter12] = useState('');
  const [page12, setPage12] = useState(1);
  const [filter13, setFilter13] = useState('');
  const [page13, setPage13] = useState(1);
  const [filter14, setFilter14] = useState('');
  const [page14, setPage14] = useState(1);
  const [filter15, setFilter15] = useState('');
  const [page15, setPage15] = useState(1);
  const [filter16, setFilter16] = useState('');
  const [page16, setPage16] = useState(1);
  const [filter17, setFilter17] = useState('');
  const [page17, setPage17] = useState(1);
  const [filter18, setFilter18] = useState('');
  const [page18, setPage18] = useState(1);
  const [filter19, setFilter19] = useState('');
  const [page19, setPage19] = useState(1);
  const [filter20, setFilter20] = useState('');
  const [page20, setPage20] = useState(1);
  const [filter21, setFilter21] = useState('');
  const [page21, setPage21] = useState(1);
  const [filter22, setFilter22] = useState('');
  const [page22, setPage22] = useState(1);
  const [filter23, setFilter23] = useState('');
  const [page23, setPage23] = useState(1);
  const [filter24, setFilter24] = useState('');
  const [page24, setPage24] = useState(1);
  const [filter25, setFilter25] = useState('');
  const [page25, setPage25] = useState(1);
  const [filter26, setFilter26] = useState('');
  const [page26, setPage26] = useState(1);
  const [filter27, setFilter27] = useState('');
  const [page27, setPage27] = useState(1);
  const [filter28, setFilter28] = useState('');
  const [page28, setPage28] = useState(1);
  const [filter29, setFilter29] = useState('');
  const [page29, setPage29] = useState(1);
  const [filter30, setFilter30] = useState('');
  const [page30, setPage30] = useState(1);
  const [filter31, setFilter31] = useState('');
  const [page31, setPage31] = useState(1);
  const [filter32, setFilter32] = useState('');
  const [page32, setPage32] = useState(1);
  const [filter33, setFilter33] = useState('');
  const [page33, setPage33] = useState(1);
  const [filter34, setFilter34] = useState('');
  const [page34, setPage34] = useState(1);
  const [filter35, setFilter35] = useState('');
  const [page35, setPage35] = useState(1);
  const [filter36, setFilter36] = useState('');
  const [page36, setPage36] = useState(1);
  const [filter37, setFilter37] = useState('');
  const [page37, setPage37] = useState(1);
  const [filter38, setFilter38] = useState('');
  const [page38, setPage38] = useState(1);
  const [filter39, setFilter39] = useState('');
  const [page39, setPage39] = useState(1);
  const [filter40, setFilter40] = useState('');
  const [page40, setPage40] = useState(1);
  const [filter41, setFilter41] = useState('');
  const [page41, setPage41] = useState(1);
  const [filter42, setFilter42] = useState('');
  const [page42, setPage42] = useState(1);
  const [filter43, setFilter43] = useState('');
  const [page43, setPage43] = useState(1);
  const [filter44, setFilter44] = useState('');
  const [page44, setPage44] = useState(1);
  const [filter45, setFilter45] = useState('');
  const [page45, setPage45] = useState(1);
  const [filter46, setFilter46] = useState('');
  const [page46, setPage46] = useState(1);
  const [filter47, setFilter47] = useState('');
  const [page47, setPage47] = useState(1);
  const [filter48, setFilter48] = useState('');
  const [page48, setPage48] = useState(1);
  const [filter49, setFilter49] = useState('');
  const [page49, setPage49] = useState(1);
  const [filter50, setFilter50] = useState('');
  const [page50, setPage50] = useState(1);
  const [filter51, setFilter51] = useState('');
  const [page51, setPage51] = useState(1);
  const [filter52, setFilter52] = useState('');
  const [page52, setPage52] = useState(1);
  const [filter53, setFilter53] = useState('');
  const [page53, setPage53] = useState(1);
  const [filter54, setFilter54] = useState('');
  const [page54, setPage54] = useState(1);
  const [filter55, setFilter55] = useState('');
  const [page55, setPage55] = useState(1);
  const [filter56, setFilter56] = useState('');
  const [page56, setPage56] = useState(1);
  const [filter57, setFilter57] = useState('');
  const [page57, setPage57] = useState(1);
  const [filter58, setFilter58] = useState('');
  const [page58, setPage58] = useState(1);
  const [filter59, setFilter59] = useState('');
  const [page59, setPage59] = useState(1);
  const [filter60, setFilter60] = useState('');
  const [page60, setPage60] = useState(1);
  useEffect(() => { setPage1(1); }, [filter1]);
  useEffect(() => { setPage2(1); }, [filter2]);
  useEffect(() => { setPage3(1); }, [filter3]);
  useEffect(() => { setPage4(1); }, [filter4]);
  useEffect(() => { setPage5(1); }, [filter5]);
  useEffect(() => { setPage6(1); }, [filter6]);
  useEffect(() => { setPage7(1); }, [filter7]);
  useEffect(() => { setPage8(1); }, [filter8]);
  useEffect(() => { setPage9(1); }, [filter9]);
  useEffect(() => { setPage10(1); }, [filter10]);
  useEffect(() => { setPage11(1); }, [filter11]);
  useEffect(() => { setPage12(1); }, [filter12]);
  useEffect(() => { setPage13(1); }, [filter13]);
  useEffect(() => { setPage14(1); }, [filter14]);
  useEffect(() => { setPage15(1); }, [filter15]);
  useEffect(() => { setPage16(1); }, [filter16]);
  useEffect(() => { setPage17(1); }, [filter17]);
  useEffect(() => { setPage18(1); }, [filter18]);
  useEffect(() => { setPage19(1); }, [filter19]);
  useEffect(() => { setPage20(1); }, [filter20]);
  useEffect(() => { setPage21(1); }, [filter21]);
  useEffect(() => { setPage22(1); }, [filter22]);
  useEffect(() => { setPage23(1); }, [filter23]);
  useEffect(() => { setPage24(1); }, [filter24]);
  useEffect(() => { setPage25(1); }, [filter25]);
  useEffect(() => { setPage26(1); }, [filter26]);
  useEffect(() => { setPage27(1); }, [filter27]);
  useEffect(() => { setPage28(1); }, [filter28]);
  useEffect(() => { setPage29(1); }, [filter29]);
  useEffect(() => { setPage30(1); }, [filter30]);
  useEffect(() => { setPage31(1); }, [filter31]);
  useEffect(() => { setPage32(1); }, [filter32]);
  useEffect(() => { setPage33(1); }, [filter33]);
  useEffect(() => { setPage34(1); }, [filter34]);
  useEffect(() => { setPage35(1); }, [filter35]);
  useEffect(() => { setPage36(1); }, [filter36]);
  useEffect(() => { setPage37(1); }, [filter37]);
  useEffect(() => { setPage38(1); }, [filter38]);
  useEffect(() => { setPage39(1); }, [filter39]);
  useEffect(() => { setPage40(1); }, [filter40]);
  useEffect(() => { setPage41(1); }, [filter41]);
  useEffect(() => { setPage42(1); }, [filter42]);
  useEffect(() => { setPage43(1); }, [filter43]);
  useEffect(() => { setPage44(1); }, [filter44]);
  useEffect(() => { setPage45(1); }, [filter45]);
  useEffect(() => { setPage46(1); }, [filter46]);
  useEffect(() => { setPage47(1); }, [filter47]);
  useEffect(() => { setPage48(1); }, [filter48]);
  useEffect(() => { setPage49(1); }, [filter49]);
  useEffect(() => { setPage50(1); }, [filter50]);
  useEffect(() => { setPage51(1); }, [filter51]);
  useEffect(() => { setPage52(1); }, [filter52]);
  useEffect(() => { setPage53(1); }, [filter53]);
  useEffect(() => { setPage54(1); }, [filter54]);
  useEffect(() => { setPage55(1); }, [filter55]);
  useEffect(() => { setPage56(1); }, [filter56]);
  useEffect(() => { setPage57(1); }, [filter57]);
  useEffect(() => { setPage58(1); }, [filter58]);
  useEffect(() => { setPage59(1); }, [filter59]);
  useEffect(() => { setPage60(1); }, [filter60]);
  const [rows, setRows] = useState([]);
  useEffect(() => { fetch('/api/users').then((r) => r.json()).then(setRows); }, []);
  const handler1 = useCallback((e) => { setFilter1(e.target.value); }, []);
  const handler2 = useCallback((e) => { setFilter2(e.target.value); }, []);
  const handler3 = useCallback((e) => { setFilter3(e.target.value); }, []);
  const handler4 = useCallback((e) => { setFilter4(e.target.value); }, []);
  const handler5 = useCallback((e) => { setFilter5(e.target.value); }, []);
  const handler6 = useCallback((e) => { setFilter6(e.target.value); }, []);
  const handler7 = useCallback((e) => { setFilter7(e.target.value); }, []);
  const handler8 = useCallback((e) => { setFilter8(e.target.value); }, []);
  const handler9 = useCallback((e) => { setFilter9(e.target.value); }, []);
  const handler10 = useCallback((e) => { setFilter10(e.target.value); }, []);
  const filtered = useMemo(() => rows.filter((r) => STATUS.includes(r.status)), [rows]);
  return (
    <div className='giant-dashboard'>
      <header><h1>Giant Dashboard</h1></header>
      <section className='filter-1'>
        <input value={filter1} onChange={(e) => setFilter1(e.target.value)} placeholder='filter 1' />
        <span>page {page1}</span>
      </section>
      <section className='filter-2'>
        <input value={filter2} onChange={(e) => setFilter2(e.target.value)} placeholder='filter 2' />
        <span>page {page2}</span>
      </section>
      <section className='filter-3'>
        <input value={filter3} onChange={(e) => setFilter3(e.target.value)} placeholder='filter 3' />
        <span>page {page3}</span>
      </section>
      <section className='filter-4'>
        <input value={filter4} onChange={(e) => setFilter4(e.target.value)} placeholder='filter 4' />
        <span>page {page4}</span>
      </section>
      <section className='filter-5'>
        <input value={filter5} onChange={(e) => setFilter5(e.target.value)} placeholder='filter 5' />
        <span>page {page5}</span>
      </section>
      <section className='filter-6'>
        <input value={filter6} onChange={(e) => setFilter6(e.target.value)} placeholder='filter 6' />
        <span>page {page6}</span>
      </section>
      <section className='filter-7'>
        <input value={filter7} onChange={(e) => setFilter7(e.target.value)} placeholder='filter 7' />
        <span>page {page7}</span>
      </section>
      <section className='filter-8'>
        <input value={filter8} onChange={(e) => setFilter8(e.target.value)} placeholder='filter 8' />
        <span>page {page8}</span>
      </section>
      <section className='filter-9'>
        <input value={filter9} onChange={(e) => setFilter9(e.target.value)} placeholder='filter 9' />
        <span>page {page9}</span>
      </section>
      <section className='filter-10'>
        <input value={filter10} onChange={(e) => setFilter10(e.target.value)} placeholder='filter 10' />
        <span>page {page10}</span>
      </section>
      <section className='filter-11'>
        <input value={filter11} onChange={(e) => setFilter11(e.target.value)} placeholder='filter 11' />
        <span>page {page11}</span>
      </section>
      <section className='filter-12'>
        <input value={filter12} onChange={(e) => setFilter12(e.target.value)} placeholder='filter 12' />
        <span>page {page12}</span>
      </section>
      <section className='filter-13'>
        <input value={filter13} onChange={(e) => setFilter13(e.target.value)} placeholder='filter 13' />
        <span>page {page13}</span>
      </section>
      <section className='filter-14'>
        <input value={filter14} onChange={(e) => setFilter14(e.target.value)} placeholder='filter 14' />
        <span>page {page14}</span>
      </section>
      <section className='filter-15'>
        <input value={filter15} onChange={(e) => setFilter15(e.target.value)} placeholder='filter 15' />
        <span>page {page15}</span>
      </section>
      <section className='filter-16'>
        <input value={filter16} onChange={(e) => setFilter16(e.target.value)} placeholder='filter 16' />
        <span>page {page16}</span>
      </section>
      <section className='filter-17'>
        <input value={filter17} onChange={(e) => setFilter17(e.target.value)} placeholder='filter 17' />
        <span>page {page17}</span>
      </section>
      <section className='filter-18'>
        <input value={filter18} onChange={(e) => setFilter18(e.target.value)} placeholder='filter 18' />
        <span>page {page18}</span>
      </section>
      <section className='filter-19'>
        <input value={filter19} onChange={(e) => setFilter19(e.target.value)} placeholder='filter 19' />
        <span>page {page19}</span>
      </section>
      <section className='filter-20'>
        <input value={filter20} onChange={(e) => setFilter20(e.target.value)} placeholder='filter 20' />
        <span>page {page20}</span>
      </section>
      <section className='filter-21'>
        <input value={filter21} onChange={(e) => setFilter21(e.target.value)} placeholder='filter 21' />
        <span>page {page21}</span>
      </section>
      <section className='filter-22'>
        <input value={filter22} onChange={(e) => setFilter22(e.target.value)} placeholder='filter 22' />
        <span>page {page22}</span>
      </section>
      <section className='filter-23'>
        <input value={filter23} onChange={(e) => setFilter23(e.target.value)} placeholder='filter 23' />
        <span>page {page23}</span>
      </section>
      <section className='filter-24'>
        <input value={filter24} onChange={(e) => setFilter24(e.target.value)} placeholder='filter 24' />
        <span>page {page24}</span>
      </section>
      <section className='filter-25'>
        <input value={filter25} onChange={(e) => setFilter25(e.target.value)} placeholder='filter 25' />
        <span>page {page25}</span>
      </section>
      <section className='filter-26'>
        <input value={filter26} onChange={(e) => setFilter26(e.target.value)} placeholder='filter 26' />
        <span>page {page26}</span>
      </section>
      <section className='filter-27'>
        <input value={filter27} onChange={(e) => setFilter27(e.target.value)} placeholder='filter 27' />
        <span>page {page27}</span>
      </section>
      <section className='filter-28'>
        <input value={filter28} onChange={(e) => setFilter28(e.target.value)} placeholder='filter 28' />
        <span>page {page28}</span>
      </section>
      <section className='filter-29'>
        <input value={filter29} onChange={(e) => setFilter29(e.target.value)} placeholder='filter 29' />
        <span>page {page29}</span>
      </section>
      <section className='filter-30'>
        <input value={filter30} onChange={(e) => setFilter30(e.target.value)} placeholder='filter 30' />
        <span>page {page30}</span>
      </section>
      <table>
        <thead><tr><th>id</th><th>name</th><th>status</th></tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.status}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}