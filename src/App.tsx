import { useEffect, useState, FormEvent } from 'react'
import { supabase } from './supabase'
const m = (n: number) => Number(n).toLocaleString('es-BO', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)

function Login() {
  const [e, setE] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('')
  const go = async (ev: FormEvent) => { ev.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p })
    if (error) setErr('Correo o contraseña incorrectos') }
  return <div className="card login"><h2>Ingresar</h2>
    <form onSubmit={go} style={{ gridTemplateColumns: '1fr' }}>
      <input type="email" placeholder="Correo" value={e} onChange={x => setE(x.target.value)} required />
      <input type="password" placeholder="Contraseña" value={p} onChange={x => setP(x.target.value)} required />
      <button className="btn">Entrar</button><span className="err">{err}</span></form></div>
}

function Facturas() {
  const [rows, setRows] = useState<any[]>([]), [msg, setMsg] = useState('')
  const [f, setF] = useState({ tipo: 'venta', fecha: today(), numero: '', contraparte: '', total: '' })
  const load = () => supabase.from('facturas').select('*').order('creado', { ascending: false }).limit(100).then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [])
  const save = async (ev: FormEvent) => { ev.preventDefault(); setMsg('')
    const { error } = await supabase.rpc('registrar_factura', { p_tipo: f.tipo, p_fecha: f.fecha, p_numero: f.numero, p_contraparte: f.contraparte, p_total: Number(f.total) })
    if (error) setMsg(error.message.includes('duplicate') ? 'Esa factura ya fue registrada' : error.message)
    else { setMsg('Factura registrada y asiento generado'); setF({ ...f, numero: '', contraparte: '', total: '' }); load() } }
  const s = (k: string) => (x: any) => setF({ ...f, [k]: x.target.value })
  return <><div className="card"><h3>Nueva factura (documento no fiscal)</h3>
    <form onSubmit={save}>
      <select value={f.tipo} onChange={s('tipo')}><option value="venta">Venta</option><option value="compra">Compra</option></select>
      <input type="date" value={f.fecha} onChange={s('fecha')} required />
      <input placeholder="N.º de factura" value={f.numero} onChange={s('numero')} required />
      <input placeholder="Cliente / Proveedor" value={f.contraparte} onChange={s('contraparte')} required />
      <input type="number" step="0.01" min="0.01" placeholder="Total Bs" value={f.total} onChange={s('total')} required />
      <button className="btn">Guardar</button></form>
    <p className={msg.startsWith('Factura') ? 'ok' : 'err'}>{msg}</p></div>
    <div className="card tw"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>N.º</th><th>Contraparte</th><th className="r">Neto</th><th className="r">IVA 13%</th><th className="r">Total</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.fecha}</td><td>{r.tipo}</td><td>{r.numero}</td><td>{r.contraparte}</td><td className="r">{m(r.neto)}</td><td className="r">{m(r.iva)}</td><td className="r">{m(r.total)}</td></tr>)}</tbody></table></div></>
}

function Diario() {
  const [rows, setRows] = useState<any[]>([])
  useEffect(() => { supabase.from('asientos').select('id,fecha,glosa,asiento_lineas(cuenta,debe,haber,cuentas(nombre))').order('fecha', { ascending: false }).limit(100).then(({ data }) => setRows(data ?? [])) }, [])
  return <>{rows.map(a => <div className="card tw" key={a.id}><b>{a.fecha} — {a.glosa}</b>
    <table><tbody>{a.asiento_lineas.map((l: any, i: number) => <tr key={i}><td>{l.cuenta} {l.cuentas?.nombre}</td><td className="r">{l.debe > 0 ? m(l.debe) : ''}</td><td className="r">{l.haber > 0 ? m(l.haber) : ''}</td></tr>)}</tbody></table></div>)}
    {!rows.length && <p className="c">Aún no hay asientos.</p>}</>
}

function Usuarios() {
  const [rows, setRows] = useState<any[]>([]), [msg, setMsg] = useState('')
  const [f, setF] = useState({ nombre: '', email: '', password: '', rol: 'usuario' })
  const load = () => supabase.from('profiles').select('*').order('creado').then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [])
  const save = async (ev: FormEvent) => { ev.preventDefault(); setMsg('')
    const { error } = await supabase.rpc('admin_crear_usuario', { p_email: f.email, p_password: f.password, p_nombre: f.nombre, p_rol: f.rol })
    if (error) setMsg(error.message); else { setMsg('Usuario creado'); setF({ nombre: '', email: '', password: '', rol: 'usuario' }); load() } }
  const s = (k: string) => (x: any) => setF({ ...f, [k]: x.target.value })
  return <><div className="card"><h3>Crear usuario</h3><form onSubmit={save}>
    <input placeholder="Nombre" value={f.nombre} onChange={s('nombre')} required />
    <input type="email" placeholder="Correo" value={f.email} onChange={s('email')} required />
    <input type="text" placeholder="Contraseña (mín. 6)" minLength={6} value={f.password} onChange={s('password')} required />
    <select value={f.rol} onChange={s('rol')}><option value="usuario">Usuario</option><option value="admin">Administrador</option></select>
    <button className="btn">Crear</button></form><p className={msg === 'Usuario creado' ? 'ok' : 'err'}>{msg}</p></div>
    <div className="card tw"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.nombre}</td><td>{r.email}</td><td>{r.rol}</td></tr>)}</tbody></table></div></>
}

export default function App() {
  const [s, setS] = useState<any>(null), [ready, setReady] = useState(false), [rol, setRol] = useState('usuario'), [tab, setTab] = useState('facturas')
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setS(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, x) => setS(x)); return () => data.subscription.unsubscribe() }, [])
  useEffect(() => { if (s) supabase.from('profiles').select('rol').eq('id', s.user.id).single().then(({ data }) => setRol(data?.rol ?? 'usuario')) }, [s])
  if (!ready) return <p className="c">Cargando…</p>
  if (!s) return <Login />
  const T = (k: string, t: string) => <button className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
  return <><div className="nf">Documentos de prueba: NO son facturas fiscales (sin integración con el SIN)</div>
    <div className="bar"><b>Contabilidad</b>{T('facturas', 'Facturas')}{T('diario', 'Libro diario')}{rol === 'admin' && T('usuarios', 'Usuarios')}
      <button onClick={() => supabase.auth.signOut()}>Salir</button></div>
    <main>{tab === 'facturas' && <Facturas />}{tab === 'diario' && <Diario />}{tab === 'usuarios' && rol === 'admin' && <Usuarios />}</main></>
}
