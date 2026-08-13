import { useSettings, type Lang } from './settings';

/**
 * Translation by exception.
 *
 * English lives inline at the call site — `t('nav.home', 'Home')` — so the
 * default language can never go missing, and only the Indonesian dictionary is
 * maintained here. An untranslated key falls back to the English text instead
 * of showing a raw key.
 *
 * Device-domain vocabulary (field labels like Reader ID or Target Torque, event
 * names, protocol names) stays English on purpose: that is how the terms appear
 * on the real hardware, in its manual and in its protocol spec.
 */
const ID: Record<string, string> = {
  // --- shell ---------------------------------------------------------------
  'skip.content': 'Lewati ke konten',
  'brand.sub': 'Laboratorium perangkat keras virtual',
  'nav.home': 'Beranda',
  'nav.simulators': 'Simulator',
  'nav.docs': 'Dokumentasi',
  'nav.about': 'Tentang',
  'footer.tagline':
    'laboratorium perangkat keras virtual untuk menguji integrasi perangkat industri tanpa perangkat fisik.',
  'footer.note': 'berjalan di browser Anda · request REST dikirim ke endpoint yang Anda konfigurasi',
  'title.simulators': 'Simulator',
  'title.docs': 'Dokumentasi',
  'title.about': 'Tentang',

  // --- settings menu -------------------------------------------------------
  'settings.label': 'Pengaturan',
  'settings.theme': 'Tema',
  'settings.theme.light': 'Terang',
  'settings.theme.dark': 'Gelap',
  'settings.lang': 'Bahasa',
  'settings.lang.en': 'English',
  'settings.lang.id': 'Indonesia',
  'settings.note': 'Pilihan disimpan di browser ini.',

  // --- home ----------------------------------------------------------------
  'home.h1': 'Simulasikan Perangkat Keras. Uji Integrasi. Tanpa Perangkat Fisik.',
  'home.lede':
    'Jelajahi perangkat industri virtual dan reproduksi perilakunya langsung dari browser — status perangkat, aksi perangkat, dan data persis seperti yang akan diterima backend Anda.',
  'home.cta.explore': 'Jelajahi Simulator',
  'home.cta.how': 'Cara Kerjanya',
  'home.fact.live': 'simulator aktif',
  'home.fact.catalog': 'ada di katalog',
  'home.fact.plug': 'perangkat perlu dicolok',
  'home.fact.browser': 'di dalam browser',
  'home.example.aria': 'Contoh keluaran perangkat',
  'home.example.note': 'Inilah request body yang akan diterima backend Anda dari reader fisik.',
  'home.explorer.title': 'Penjelajah Simulator',
  'home.explorer.sub':
    'Perangkat dikelompokkan seperti di pabrik: menurut apa yang mereka identifikasi, gerakkan, lihat, atau ajak berkomunikasi.',
  'home.viewall': 'Lihat semua',
  'home.how.title': 'Cara Kerjanya',
  'home.how.sub': 'Pilih → Konfigurasi → Simulasikan → Periksa.',
  'home.step': 'LANGKAH',
  'step.choose.title': 'Pilih Perangkat',
  'step.choose.text': 'Pilih perangkat keras yang ingin Anda simulasikan dari katalog.',
  'step.configure.title': 'Konfigurasi',
  'step.configure.text':
    'Atur parameter perangkat — alamat IP, reader ID, port, antena, protokol, target torsi.',
  'step.simulate.title': 'Simulasikan',
  'step.simulate.text': 'Picu aksi persis seperti yang dilakukan perangkat sungguhan.',
  'step.inspect.title': 'Periksa',
  'step.inspect.text': 'Amati status, event, payload, respons, dan log komunikasi.',
  'home.why.title': 'Mengapa Simulasi Perangkat Keras?',
  'home.why.sub':
    'Perangkat keras jarang menjadi penghambat karena pilihan — ia menghambat karena jumlahnya cuma satu, letaknya di tempat lain, dan tidak pernah rusak saat Anda membutuhkannya.',
  'reason.expensive.title': 'Perangkat keras itu mahal',
  'reason.expensive.text':
    'Satu kontroler pengencang atau gate RFID harganya melebihi software yang berbicara dengannya. Simulasikan antarmukanya, alih-alih membeli perangkatnya.',
  'reason.scarce.title': 'Perangkat keras itu langka',
  'reason.scarce.text':
    'Satu perangkat, banyak developer. Simulator memberi setiap engineer instance-nya sendiri, sepanjang hari, tanpa daftar antrean.',
  'reason.share.title': 'Perangkat keras sulit dibagikan',
  'reason.share.text':
    'Perangkat berada di jaringan pabrik di balik firewall. Simulator berbasis browser ikut ke mana pun orangnya pergi.',
  'reason.remote.title': 'Pengujian jarak jauh menyulitkan',
  'reason.remote.text':
    'Anda tidak bisa menarik trigger reader handheld lewat VPN. Di sini bisa, dari mana saja.',
  'reason.edge.title': 'Kasus tepi jarang muncul',
  'reason.edge.text':
    'Hasil NG, gangguan spindle, tag yang tidak pernah terbaca — semuanya satu klik, bukan menunggu shift yang kebetulan apes.',
  'reason.repeat.title': 'Integrasi butuh pengulangan',
  'reason.repeat.text':
    'Perilaku perangkat yang deterministik dan dapat diulang justru itulah yang dibutuhkan uji integrasi dan demo.',
  'home.engineers.title': 'Dibangun untuk Engineer',
  'home.engineers.sub':
    'Simulator mereproduksi tiga hal: status perangkat, aksi perangkat, dan komunikasi perangkat. Itu sudah cukup untuk menjadi dasar pengembangan, pengujian, dan demonstrasi.',
  'use.dev': 'Pengembangan',
  'use.integration': 'Uji integrasi',
  'use.backend': 'Pengembangan backend',
  'use.frontend': 'Pengembangan frontend',
  'use.qa': 'QA',
  'use.demo': 'Demonstrasi',
  'use.training': 'Pelatihan',
  'use.debug': 'Debugging',
  'home.soon.title': 'Segera Hadir',
  'home.soon.sub': 'Sudah dideklarasikan di katalog dan berikutnya dalam antrean implementasi.',
  'home.soon.cta': 'Lihat katalog lengkap',

  // --- explorer ------------------------------------------------------------
  'explorer.eyebrow': 'Katalog',
  'explorer.title': 'Simulator',
  'explorer.sub':
    'Setiap perangkat adalah modul mandiri dengan konfigurasi, aksi, status, dan payload-nya sendiri. Simulator aktif terbuka di workspace; yang direncanakan dideklarasikan lebih dulu di sini.',
  'card.open': 'Buka',
  'card.planned': 'direncanakan',
  'count.live': 'aktif',
  'count.planned': 'direncanakan',

  // --- workspace -----------------------------------------------------------
  'ws.switch': 'Ganti perangkat',
  'ws.all': 'Semua simulator',
  'ws.config': 'Konfigurasi Perangkat',
  'ws.config.dirty': 'perubahan belum diterapkan',
  'ws.config.apply': 'Terapkan Konfigurasi',
  'ws.config.defaults': 'Kembalikan Default',
  'ws.config.offline': 'Menerapkan konfigurasi akan membuat perangkat online.',
  'ws.config.online': 'Nilai divalidasi oleh perangkat sebelum diterapkan.',
  'ws.locked':
    'Perangkat masih offline. Terapkan konfigurasi di atas untuk membuatnya online — kendali di bawah akan terbuka setelah itu.',
  'ws.controls': 'Kendali Perangkat',
  'ws.state': 'Status Perangkat Langsung',
  'ws.comm': 'Log Komunikasi',
  'ws.comm.empty':
    'Belum ada lalu lintas. Aksi yang akan menjangkau backend muncul di sini beserta protokolnya.',
  'ws.comm.note':
    'Request REST benar-benar dikirim ke endpoint yang Anda konfigurasi; frame TCP, Modbus, dan MQTT hanya dibuat untuk diperiksa. Pilih event di atas untuk membaca frame lengkapnya.',
  'ws.comm.time': 'Waktu',
  'ws.comm.protocol': 'Protokol',
  'ws.comm.direction': 'Arah',
  'ws.comm.frame': 'Frame',
  'ws.comm.result': 'Hasil',
  'ws.comm.generated': 'dibuat saja',
  'ws.comm.blocked': 'diblokir',
  'ws.unknown': 'Simulator tidak dikenal',
  'ws.unknown.body': 'bukan simulator yang aktif. Pilih salah satu berikut:',
  'ws.unknown.browse': 'Jelajahi katalog lengkap',
  'field.on': 'Aktif',
  'field.off': 'Nonaktif',
  'unit.events': 'event',
  'unit.frames': 'frame',

  // --- event stream & inspector -------------------------------------------
  'es.title': 'Aliran Event',
  'es.filter': 'Saring event',
  'es.pause': 'Jeda',
  'es.resume': 'Lanjutkan',
  'es.paused': 'dijeda',
  'es.clear': 'Bersihkan',
  'es.empty': 'Belum ada event. Picu satu aksi perangkat untuk menghasilkannya.',
  'es.nomatch': 'Tidak ada event yang cocok dengan saringan ini.',
  'es.note': 'Terbaru di atas · klik baris untuk memeriksanya · timestamp dalam ISO-8601 UTC',
  'pi.title': 'Pemeriksa Payload',
  'pi.views': 'Tampilan payload',
  'pi.sample': 'Contoh payload — jalankan sebuah aksi untuk memeriksa payload sungguhan.',
  'pi.notransport': 'tanpa frame transport',
  'action.copy': 'Salin',
  'action.copied': 'Tersalin',
  'copy.manual': 'Salin manual:',

  // --- device panels -------------------------------------------------------
  'np.title': 'Urutan Pengencangan',
  'np.target': 'target',
  'np.torque': 'Torsi',
  'np.angle': 'Sudut',
  'np.phase': 'Fase',
  'np.cycle': 'Siklus',
  'np.window': 'Jendela terima',
  'np.note':
    'Pita hijau adalah jendela penerimaan. Garis adalah ramp torsi siklus berjalan; tepi bar adalah pembacaan langsung.',
  'io.title': 'Kanal I/O',
  'io.hint': 'klik kanal untuk mengubah kondisinya',
  'io.inputs': 'Input',
  'io.outputs': 'Output',
  'io.of': 'dari',
  'io.toggle': 'Ubah',
  'io.note':
    'Input memodelkan sinyal lapangan (sensor, tombol); output memodelkan beban yang digerakkan (katup, lampu). Setiap transisi dicatat dan dibingkai untuk transport yang dikonfigurasi.',

  // --- rfid send result ---
  'send.title': 'Hasil Pengiriman',
  'send.sending': 'MENGIRIM…',
  'send.idle': 'BELUM ADA PENGIRIMAN',
  'send.ok': 'TERKIRIM',
  'send.fail': 'GAGAL',
  'send.delivered': 'terkirim',
  'send.failed': 'gagal',
  'send.message': 'Respons',
  'send.nobody': '(body kosong)',
  'send.empty': 'Tekan Scan Once atau Start Scan — respons dari endpoint Anda akan muncul di sini.',
  'send.err.timeout': 'Tidak ada respons dalam {seconds} detik — server tidak menjawab.',
  'send.err.mixed':
    'Diblokir: halaman ini disajikan lewat HTTPS sedangkan endpoint-nya HTTP (mixed content). Gunakan endpoint HTTPS, atau jalankan simulator secara lokal lewat HTTP.',
  'send.err.unreachable':
    'Tidak dapat menjangkau {host}. Browser memblokir request atau host tidak dapat dihubungi — pastikan server berjalan dan mengirim header CORS (Access-Control-Allow-Origin) untuk halaman ini.',
  'send.note':
    'Request ini benar-benar dikirim dari browser Anda. Kegagalan di sini adalah kegagalan sungguhan: endpoint menolak, tidak dapat dijangkau, atau tidak mengizinkan halaman ini (CORS).',

  // --- rfid tag list panel ---
  'rfid.title': 'Daftar Tag',
  'rfid.live': 'langsung berlaku',
  'rfid.generate': 'Buat Tag Acak',
  'rfid.label': 'Tag hasil pemindaian — satu EPC per baris',
  'rfid.note':
    'Setiap sapuan mengirim seluruh daftar ini sebagai array idHex — satu request per sapuan, bukan satu request per tag. Tidak perlu Terapkan Konfigurasi.',
  'unit.tags': 'tag',

  // --- device catalog copy -------------------------------------------------
  'sim.rfid-handheld.tagline':
    'Reader UHF genggam yang benar-benar mengirim satu batch pembacaan tag ke API warehouse Anda.',
  'sim.rfid-handheld.description':
    'Mensimulasikan reader RFID UHF genggam: sapuan sekali picu atau kontinu, masing-masing mengirim seluruh daftar tag dalam satu request ke endpoint yang Anda konfigurasi. Request-nya benar-benar dikirim, sehingga responsnya — status, pesan, dan waktu — memberi tahu apakah backend Anda menerimanya. Daftar tag bisa diubah langsung tanpa menerapkan ulang konfigurasi.',
  'sim.nutrunner.tagline': 'Pengencangan terkendali torsi dengan penilaian OK / NG dan pelaporan hasil.',
  'sim.nutrunner.description':
    'Mensimulasikan spindle pengencang: menjalankan ramp torsi dan sudut menuju target, menilai hasil pengencangan terhadap pita toleransi, lalu melaporkannya seperti kontroler sungguhan — termasuk kasus NG paksa dan gangguan alat yang sulit direproduksi di lini produksi.',
  'sim.digital-io.tagline': 'Blok input / output diskret dengan sakelar per kanal dan event perubahan.',
  'sim.digital-io.description':
    'Mensimulasikan modul I/O diskret: ubah input atau output mana pun dan amati notifikasi perubahan yang akan diterima backend Anda. Model yang sama mencakup board ESP32, modul W5500, atau coupler Modbus TCP — yang berbeda hanya transport-nya.',
  'sim.rfid-reader.tagline': 'Reader gerbang multi-antena tetap dengan aliran tag.',
  'sim.barcode-scanner.tagline': 'Masukan barcode via keyboard-wedge dan TCP.',
  'sim.vin-scanner.tagline': 'Penangkapan dan validasi nomor identifikasi kendaraan.',
  'sim.torque-tool.tagline': 'Alat tangan dengan jejak torsi dan sudut.',
  'sim.industrial-camera.tagline': 'Trigger, eksposur, dan metadata citra.',
  'sim.vision-inspection.tagline': 'Inspeksi lolos / gagal dengan area cacat.',
  'sim.conveyor.tagline': 'Kecepatan sabuk, okupansi, dan kondisi berhenti.',
  'sim.plc.tagline': 'Tabel tag, siklus scan, dan akses register.',
  'sim.sensor.tagline': 'Sinyal analog dengan derau, drift, dan alarm.',
  'sim.tester.tagline': 'Stasiun uji akhir lini beserta putusannya.',
  'sim.rest-device.tagline': 'Perangkat generik yang diekspos lewat HTTP.',
  'sim.tcp-device.tagline': 'Pembingkaian socket mentah dan keep-alive.',
  'sim.mqtt-device.tagline': 'Topic, QoS, dan pesan last-will.',
  'sim.modbus-device.tagline': 'Coil, register, dan function code.',

  // --- docs ----------------------------------------------------------------
  'docs.eyebrow': 'Dokumentasi',
  'docs.title': 'Cara Kerjanya',
  'docs.intro':
    'Stechoq Hardware Simulation adalah laboratorium perangkat keras virtual. Setiap simulator mereproduksi tiga hal dari perangkat fisik: statusnya, aksinya, dan komunikasinya. Antarmuka hanyalah cara Anda mengendalikan dan mengamati simulasi itu — mesin simulasinya sendiri tidak tahu-menahu soal adanya UI.',
  'docs.callout.title': 'Mana yang benar-benar dikirim, mana yang hanya dibuat.',
  'docs.callout.text':
    'RFID handheld mengirim payload-nya sungguhan ke endpoint yang Anda konfigurasi, lalu menampilkan responsnya — status, pesan, dan waktu. Frame TCP, Modbus, dan MQTT hanya dibuat untuk diperiksa, karena browser tidak bisa membuka socket tersebut. Versi sungguhan dari transport itu ada di peta jalan.',
  'docs.use.title': 'Menggunakan simulator',
  'docs.use.1': 'Buka sebuah perangkat dari katalog.',
  'docs.use.2':
    'Ubah konfigurasinya lalu tekan Terapkan Konfigurasi. Perangkat menjadi online dan memancarkan DEVICE_CONFIGURED.',
  'docs.use.3': 'Picu sebuah aksi dari panel Kendali Perangkat.',
  'docs.use.4':
    'Amati Status Perangkat Langsung, baca Aliran Event, dan buka event mana pun di Pemeriksa Payload untuk menyalin JSON yang akan diterima backend Anda.',
  'docs.use.5':
    'Log Komunikasi hanya memuat event yang menghasilkan lalu lintas, lengkap dengan frame protokol di baliknya.',
  'docs.events.title': 'Sistem event',
  'docs.events.text':
    'Setiap aksi menghasilkan sebuah event, dan semua simulator memakai amplop yang sama. Itulah yang membuat satu workspace bisa melayani semua perangkat.',
  'docs.events.features':
    'Di Aliran Event Anda dapat menyaring berdasarkan nama atau ringkasan, menjeda log tanpa menghentikan perangkat, membentangkan satu baris untuk melihat amplopnya, menyalin payload mana pun, dan membersihkan riwayat. Timestamp memakai ISO-8601 UTC; aliran menampilkan komponen waktunya.',
  'docs.reference.title': 'Referensi perangkat',
  'docs.reference.interface': 'Antarmuka',
  'docs.reference.values': 'Nilai',
  'docs.reference.id': 'Id simulator',
  'docs.reference.config': 'Konfigurasi',
  'docs.reference.actions': 'Aksi',
  'docs.reference.protocols': 'Protokol',
  'docs.reference.sample': 'Contoh payload',
  'docs.arch.title': 'Arsitektur',
  'docs.arch.text':
    'Mesinnya adalah kelas TypeScript biasa. Kelas dasar Simulator memegang langganan, log event, timer, validasi konfigurasi, dan reset; subkelas perangkat mendeklarasikan metadata, skema konfigurasi, aksi, status, dan perilakunya. Workspace merender simulator apa pun dari deklarasi tersebut, sehingga perangkat baru tidak memerlukan pekerjaan UI.',
  'docs.add.title': 'Menambahkan simulator',
  'docs.add.sub': 'Satu kelas, satu baris di registry',
  'docs.layers.title': 'Lapisan komunikasi',
  'docs.layers.text':
    'Frame protokol dihasilkan oleh builder kecil (httpPost, mqttPublish, tcpFrame, modbusWrite) yang semuanya mengembalikan bentuk TransportFrame yang sama. Pemeriksa hanya mencetak apa yang diberikan kepadanya, sehingga menambah pesan WebSocket, stream TCP mentah, atau peta register Modbus nanti berarti menambah builder, bukan menambah UI.',
  'docs.engmode.title': 'Mode engineering',
  'docs.engmode.text':
    'MVP ini menampilkan lapisan JSON/event beserta frame protokol yang dihasilkan. Header HTTP, sesi WebSocket dan MQTT langsung, stream TCP, tabel register Modbus, dan rekaman transisi status direncanakan pada deretan tab yang sama di Pemeriksa Payload.',
  'docs.deploy.title': 'Deployment',
  'docs.deploy.build': 'Build',
  'docs.deploy.output': 'Direktori keluaran',
  'docs.deploy.hosting': 'Hosting',
  'docs.deploy.hosting.value':
    'Cloudflare Pages (statis). Routing berbasis hash, jadi tidak perlu aturan rewrite SPA.',
  'docs.deploy.backend': 'Backend',
  'docs.deploy.backend.value': 'Tidak diperlukan.',

  // --- about ---------------------------------------------------------------
  'about.eyebrow': 'Tentang',
  'about.title': 'Laboratorium perangkat keras virtual untuk menguji integrasi perangkat industri',
  'about.intro':
    'Software industri biasanya ditulis berdampingan dengan perangkat keras industri. Perangkat itu mahal, jumlahnya cuma satu, hidupnya di jaringan pabrik, dan menolak rusak justru saat Anda membutuhkannya. Stechoq Hardware Simulation menghapus ketergantungan itu: buka browser, pilih perangkat, dan bekerjalah dengan perilakunya alih-alih dengan perangkatnya.',
  'about.is.title': 'Ini adalah',
  'about.is.1': 'Tempat bermain untuk perilaku perangkat industri — status, aksi, komunikasi.',
  'about.is.2': 'Sumber payload realistis untuk pekerjaan backend dan integrasi.',
  'about.is.3':
    'Cara mereproduksi kasus tepi sesuai permintaan: pengencangan NG, tag yang terlewat, gangguan alat.',
  'about.is.4':
    'Alat demo dan pelatihan yang tidak perlu membawa satu peti perangkat keras ke mana-mana.',
  'about.isnot.title': 'Ini bukan',
  'about.isnot.1': 'Bukan kumpulan mockup — setiap simulator adalah mesin status sungguhan.',
  'about.isnot.2':
    'Bukan driver perangkat, dan bukan pengganti commissioning akhir pada perangkat keras nyata.',
  'about.isnot.3': 'Bukan dashboard untuk data pabrik langsung.',
  'about.principle.title': 'Prinsip produk',
  'about.principle.text':
    'Satu platform untuk mensimulasikan perilaku perangkat keras industri. Sebuah simulator harus mereproduksi status perangkat, aksi perangkat, dan komunikasi perangkat. UI hanyalah antarmuka untuk mengendalikan dan mengamati simulasi, dan mesin simulasinya tetap independen darinya.',
  'about.roadmap.title': 'Peta jalan',
  'about.roadmap.intro.a': 'Katalog sudah mendeklarasikan',
  'about.roadmap.intro.b':
    'perangkat lain di bidang identifikasi, vision, peralatan pabrik, dan endpoint komunikasi murni. Bersama itu:',
  'about.roadmap.1': 'Transport sungguhan — WebSocket, MQTT, TCP, dan REST ke backend Anda sendiri.',
  'about.roadmap.2': 'Peta register Modbus dan tampilan frame mentah di pemeriksa.',
  'about.roadmap.3': 'Sesi simulasi persisten dan setup perangkat yang dapat dibagikan.',
  'about.roadmap.4': 'Sesi bersama, agar satu tim bisa menjalankan satu lini tersimulasi bersama-sama.',
  'about.roadmap.5': 'Skenario terskrip untuk uji regresi dan uji beban.',
  'about.stechoq.title': 'Dibangun oleh Stechoq',
  'about.stechoq.text':
    'Stechoq membangun software industri untuk lini manufaktur. Platform ini berawal sebagai perkakas internal untuk persoalan di atas, dan tumbuh satu simulator setiap kali.',
  'about.cta.explore': 'Jelajahi simulatornya',
  'about.cta.docs': 'Baca dokumentasinya',
};

const DICTS: Record<Lang, Record<string, string>> = { en: {}, id: ID };

export type Translate = (key: string, english: string) => string;

export function translate(lang: Lang, key: string, english: string): string {
  return DICTS[lang][key] ?? english;
}

/** `const t = useT()` then `t('nav.home', 'Home')`. */
export function useT(): Translate {
  const { lang } = useSettings();
  return (key, english) => translate(lang, key, english);
}
