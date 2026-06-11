// Catálogo de equipos — grupos reales del Mundial 2026 (sorteo dic-2025 + repechajes mar-2026)
// Código FIFA, nombre, bandera y grupo. "TBD" sirve para fases eliminatorias antes de conocerse el cruce.
const EQUIPOS = {
  // Grupo A
  MEX:{n:"México",f:"🇲🇽",g:"A"}, RSA:{n:"Sudáfrica",f:"🇿🇦",g:"A"}, KOR:{n:"Corea del Sur",f:"🇰🇷",g:"A"}, CZE:{n:"Chequia",f:"🇨🇿",g:"A"},
  // Grupo B
  CAN:{n:"Canadá",f:"🇨🇦",g:"B"}, BIH:{n:"Bosnia y Herz.",f:"🇧🇦",g:"B"}, QAT:{n:"Catar",f:"🇶🇦",g:"B"}, SUI:{n:"Suiza",f:"🇨🇭",g:"B"},
  // Grupo C
  BRA:{n:"Brasil",f:"🇧🇷",g:"C"}, MAR:{n:"Marruecos",f:"🇲🇦",g:"C"}, HAI:{n:"Haití",f:"🇭🇹",g:"C"}, SCO:{n:"Escocia",f:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",g:"C"},
  // Grupo D
  USA:{n:"Estados Unidos",f:"🇺🇸",g:"D"}, PAR:{n:"Paraguay",f:"🇵🇾",g:"D"}, AUS:{n:"Australia",f:"🇦🇺",g:"D"}, TUR:{n:"Turquía",f:"🇹🇷",g:"D"},
  // Grupo E
  GER:{n:"Alemania",f:"🇩🇪",g:"E"}, CUW:{n:"Curazao",f:"🇨🇼",g:"E"}, CIV:{n:"Costa de Marfil",f:"🇨🇮",g:"E"}, ECU:{n:"Ecuador",f:"🇪🇨",g:"E"},
  // Grupo F
  NED:{n:"Países Bajos",f:"🇳🇱",g:"F"}, JPN:{n:"Japón",f:"🇯🇵",g:"F"}, SWE:{n:"Suecia",f:"🇸🇪",g:"F"}, TUN:{n:"Túnez",f:"🇹🇳",g:"F"},
  // Grupo G
  BEL:{n:"Bélgica",f:"🇧🇪",g:"G"}, EGY:{n:"Egipto",f:"🇪🇬",g:"G"}, IRN:{n:"Irán",f:"🇮🇷",g:"G"}, NZL:{n:"Nueva Zelanda",f:"🇳🇿",g:"G"},
  // Grupo H
  ESP:{n:"España",f:"🇪🇸",g:"H"}, CPV:{n:"Cabo Verde",f:"🇨🇻",g:"H"}, KSA:{n:"Arabia Saudita",f:"🇸🇦",g:"H"}, URU:{n:"Uruguay",f:"🇺🇾",g:"H"},
  // Grupo I
  FRA:{n:"Francia",f:"🇫🇷",g:"I"}, SEN:{n:"Senegal",f:"🇸🇳",g:"I"}, IRQ:{n:"Irak",f:"🇮🇶",g:"I"}, NOR:{n:"Noruega",f:"🇳🇴",g:"I"},
  // Grupo J
  ARG:{n:"Argentina",f:"🇦🇷",g:"J"}, ALG:{n:"Argelia",f:"🇩🇿",g:"J"}, AUT:{n:"Austria",f:"🇦🇹",g:"J"}, JOR:{n:"Jordania",f:"🇯🇴",g:"J"},
  // Grupo K
  POR:{n:"Portugal",f:"🇵🇹",g:"K"}, COD:{n:"RD del Congo",f:"🇨🇩",g:"K"}, UZB:{n:"Uzbekistán",f:"🇺🇿",g:"K"}, COL:{n:"Colombia",f:"🇨🇴",g:"K"},
  // Grupo L
  ENG:{n:"Inglaterra",f:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",g:"L"}, CRO:{n:"Croacia",f:"🇭🇷",g:"L"}, GHA:{n:"Ghana",f:"🇬🇭",g:"L"}, PAN:{n:"Panamá",f:"🇵🇦",g:"L"},
  // Comodín para llaves eliminatorias sin definir
  TBD:{n:"Por definir",f:"❔",g:""}
};

const GRUPOS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

const FASES = {
  GRUPOS:"Fase de grupos", R32:"Dieciseisavos", R16:"Octavos",
  QF:"Cuartos", SF:"Semifinal", "3P":"Tercer lugar", F:"Final"
};

function nombreEquipo(c){ return (EQUIPOS[c]||{n:c}).n; }
function banderaEquipo(c){ return (EQUIPOS[c]||{f:"❔"}).f; }
