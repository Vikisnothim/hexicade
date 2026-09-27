import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  io,
} from "socket.io-client";

import "./App.css";

/*
=========================================================
SERVER ADDRESS

Locally:
http://localhost:3000

Later Render will provide the real address
through VITE_SERVER_URL.
=========================================================
*/

const SERVER_URL =
  import.meta.env
    .VITE_SERVER_URL ||
  "http://localhost:3000";

const socket =
  io(SERVER_URL);

/*
=========================================================
BOARD CONSTANTS
=========================================================
*/

const COLS = 10;
const ROWS = 9;

const HEX_SIZE = 42;
const HEX_DRAW = 34;

const SQRT3 =
  Math.sqrt(3);

const MARGIN = 65;

const BOARD_WIDTH =
  MARGIN * 2 +
  HEX_SIZE * 2 +
  (COLS - 1) *
    HEX_SIZE *
    1.5;

const BOARD_HEIGHT =
  MARGIN * 2 +
  SQRT3 *
    HEX_SIZE *
    (ROWS + 0.5);

const START_BARRIERS =
  10;

/*
=========================================================
BASIC HELPERS
=========================================================
*/

function idOf(
  col,
  row
) {
  return `${col},${row}`;
}

function parseId(id) {
  const [
    col,
    row,
  ] =
    id
      .split(",")
      .map(Number);

  return {
    col,
    row,
  };
}

function inside(
  col,
  row
) {
  return (
    col >= 0 &&
    col < COLS &&
    row >= 0 &&
    row < ROWS
  );
}

/*
=========================================================
GOAL HEXES
=========================================================
*/

const P1_GOALS =
  new Set([
    idOf(0, 0),
    idOf(2, 0),
    idOf(4, 0),
    idOf(6, 0),
    idOf(8, 0),
  ]);

const P2_GOALS =
  new Set([
    idOf(
      1,
      ROWS - 1
    ),

    idOf(
      3,
      ROWS - 1
    ),

    idOf(
      5,
      ROWS - 1
    ),

    idOf(
      7,
      ROWS - 1
    ),

    idOf(
      9,
      ROWS - 1
    ),
  ]);

/*
=========================================================
HEX COORDINATES
=========================================================
*/

function offsetToAxial(
  col,
  row
) {
  return {
    q: col,

    r:
      row -
      (col -
        (col & 1)) /
        2,
  };
}

function axialToOffset(
  q,
  r
) {
  return {
    col: q,

    row:
      r +
      (q -
        (q & 1)) /
        2,
  };
}

const AXIAL_DIRS = [
  {
    q: 1,
    r: 0,
  },

  {
    q: 1,
    r: -1,
  },

  {
    q: 0,
    r: -1,
  },

  {
    q: -1,
    r: 0,
  },

  {
    q: -1,
    r: 1,
  },

  {
    q: 0,
    r: 1,
  },
];

function neighborsOf(
  cellId
) {
  const {
    col,
    row,
  } =
    parseId(
      cellId
    );

  const axial =
    offsetToAxial(
      col,
      row
    );

  return AXIAL_DIRS
    .map(
      (
        direction
      ) =>
        axialToOffset(
          axial.q +
            direction.q,

          axial.r +
            direction.r
        )
    )

    .filter(
      ({
        col: c,
        row: r,
      }) =>
        inside(
          c,
          r
        )
    )

    .map(
      ({
        col: c,
        row: r,
      }) =>
        idOf(
          c,
          r
        )
    );
}

/*
=========================================================
DRAWING
=========================================================
*/

function centerOf(
  col,
  row
) {
  const x =
    MARGIN +
    HEX_SIZE +
    col *
      HEX_SIZE *
      1.5;

  const y =
    MARGIN +
    (SQRT3 *
      HEX_SIZE) /
      2 +
    row *
      SQRT3 *
      HEX_SIZE +
    (col % 2) *
      ((SQRT3 *
        HEX_SIZE) /
        2);

  return {
    x,
    y,
  };
}

function vertexOf(
  col,
  row,
  vertex,
  radius =
    HEX_DRAW
) {
  const center =
    centerOf(
      col,
      row
    );

  const angle =
    (Math.PI /
      180) *
    (vertex * 60);

  return {
    x:
      center.x +
      radius *
        Math.cos(angle),

    y:
      center.y +
      radius *
        Math.sin(angle),
  };
}

function hexPoints(
  cx,
  cy,
  radius =
    HEX_DRAW
) {
  const points = [];

  for (
    let i = 0;
    i < 6;
    i++
  ) {
    const angle =
      (Math.PI /
        180) *
      (i * 60);

    points.push(
      `${
        cx +
        radius *
          Math.cos(
            angle
          )
      },${
        cy +
        radius *
          Math.sin(
            angle
          )
      }`
    );
  }

  return points.join(
    " "
  );
}

function edgeKey(
  a,
  b
) {
  return [a, b]
    .sort()
    .join("|");
}

/*
=========================================================
BARRICADE GEOMETRY
=========================================================
*/

function normalizeAngle(
  angle
) {
  while (
    angle < 0
  ) {
    angle += 360;
  }

  while (
    angle >= 360
  ) {
    angle -= 360;
  }

  return angle;
}

function angleDifference(
  a,
  b
) {
  let difference =
    Math.abs(
      normalizeAngle(
        a
      ) -
        normalizeAngle(
          b
        )
    );

  if (
    difference >
    180
  ) {
    difference =
      360 -
      difference;
  }

  return difference;
}

function neighborInDirection(
  cellId,
  targetAngle
) {
  const {
    col,
    row,
  } =
    parseId(
      cellId
    );

  const center =
    centerOf(
      col,
      row
    );

  let best = null;

  let bestDifference =
    Infinity;

  for (
    const neighbor
    of neighborsOf(
      cellId
    )
  ) {
    const n =
      parseId(
        neighbor
      );

    const neighborCenter =
      centerOf(
        n.col,
        n.row
      );

    const angle =
      normalizeAngle(
        (Math.atan2(
          neighborCenter.y -
            center.y,

          neighborCenter.x -
            center.x
        ) *
          180) /
          Math.PI
      );

    const difference =
      angleDifference(
        angle,
        targetAngle
      );

    if (
      difference <
      bestDifference
    ) {
      bestDifference =
        difference;

      best =
        neighbor;
    }
  }

  return bestDifference <
    10
    ? best
    : null;
}

function createCornerBarrier(
  cellId,
  vertexIndex
) {
  const {
    col,
    row,
  } =
    parseId(
      cellId
    );

  const vertexAngle =
    vertexIndex * 60;

  const neighbor1 =
    neighborInDirection(
      cellId,
      vertexAngle -
        30
    );

  const neighbor2 =
    neighborInDirection(
      cellId,
      vertexAngle +
        30
    );

  if (
    !neighbor1 ||
    !neighbor2
  ) {
    return null;
  }

  const edge1 =
    edgeKey(
      cellId,
      neighbor1
    );

  const edge2 =
    edgeKey(
      cellId,
      neighbor2
    );

  const edges = [
    edge1,
    edge2,
  ].sort();

  const previousVertex =
    vertexOf(
      col,
      row,
      (vertexIndex +
        5) %
        6,

      HEX_DRAW + 6
    );

  const corner =
    vertexOf(
      col,
      row,
      vertexIndex,

      HEX_DRAW + 6
    );

  const nextVertex =
    vertexOf(
      col,
      row,
      (vertexIndex +
        1) %
        6,

      HEX_DRAW + 6
    );

  return {
    id:
      edges.join(
        "::"
      ),

    cellId,

    vertexIndex,

    edges,

    points: [
      previousVertex,
      corner,
      nextVertex,
    ],
  };
}

function buildAllBarrierPositions() {
  const map =
    new Map();

  for (
    let col = 0;
    col < COLS;
    col++
  ) {
    for (
      let row = 0;
      row < ROWS;
      row++
    ) {
      const cellId =
        idOf(
          col,
          row
        );

      for (
        let vertex = 0;
        vertex < 6;
        vertex++
      ) {
        const barrier =
          createCornerBarrier(
            cellId,
            vertex
          );

        if (barrier) {
          map.set(
            barrier.id,
            barrier
          );
        }
      }
    }
  }

  return [
    ...map.values(),
  ];
}

const ALL_BARRIERS =
  buildAllBarrierPositions();

/*
=========================================================
PATH FINDING
=========================================================
*/

function shortestPathLength(
  startId,
  targetGoals,
  blockedEdges
) {
  const queue = [
    {
      id: startId,
      distance: 0,
    },
  ];

  const visited =
    new Set([
      startId,
    ]);

  while (
    queue.length >
    0
  ) {
    const current =
      queue.shift();

    if (
      targetGoals.has(
        current.id
      )
    ) {
      return current.distance;
    }

    for (
      const next
      of neighborsOf(
        current.id
      )
    ) {
      if (
        blockedEdges.has(
          edgeKey(
            current.id,
            next
          )
        )
      ) {
        continue;
      }

      if (
        !visited.has(
          next
        )
      ) {
        visited.add(
          next
        );

        queue.push({
          id: next,

          distance:
            current.distance +
            1,
        });
      }
    }
  }

  return Infinity;
}

/*
=========================================================
CLOCK
=========================================================
*/

function formatTime(
  seconds
) {
  const minutes =
    Math.floor(
      seconds / 60
    );

  const remaining =
    seconds % 60;

  return `${minutes}:${remaining
    .toString()
    .padStart(
      2,
      "0"
    )}`;
}

/*
=========================================================
INITIAL STATE
=========================================================
*/

function createInitialGameState(
  minutes = 5
) {
  return {
    positions: {
      P1:
        idOf(
          4,
          ROWS - 1
        ),

      P2:
        idOf(
          5,
          0
        ),
    },

    turn: "P1",

    barriers: [],

    barriersLeft: {
      P1:
        START_BARRIERS,

      P2:
        START_BARRIERS,
    },

    winner: null,

    timeLeft: {
      P1:
        minutes *
        60,

      P2:
        minutes *
        60,
    },
  };
}

/*
=========================================================
MAIN APP
=========================================================
*/

function App() {
  /*
  SETUP
  */

  const [
    started,
    setStarted,
  ] =
    useState(false);

  const [
    mode,
    setMode,
  ] =
    useState("BOT");

  const [
    player1Name,
    setPlayer1Name,
  ] =
    useState(
      "Player 1"
    );

  const [
    player2Name,
    setPlayer2Name,
  ] =
    useState(
      "HexBot"
    );

  const [
    startingMinutes,
    setStartingMinutes,
  ] =
    useState(5);

  /*
  ONLINE
  */

  const [
    onlineChoice,
    setOnlineChoice,
  ] =
    useState(
      "CREATE"
    );

  const [
    onlineName,
    setOnlineName,
  ] =
    useState("");

  const [
    roomInput,
    setRoomInput,
  ] =
    useState("");

  const [
    roomCode,
    setRoomCode,
  ] =
    useState("");

  const [
    onlineRole,
    setOnlineRole,
  ] =
    useState(null);

  const [
    onlineStatus,
    setOnlineStatus,
  ] =
    useState("");

  /*
  GAME
  */

  const [
    positions,
    setPositions,
  ] =
    useState(
      createInitialGameState()
        .positions
    );

  const [
    turn,
    setTurn,
  ] =
    useState("P1");

  const [
    actionMode,
    setActionMode,
  ] =
    useState(
      "MOVE"
    );

  const [
    selectedHex,
    setSelectedHex,
  ] =
    useState(null);

  const [
    barriers,
    setBarriers,
  ] =
    useState([]);

  const [
    barriersLeft,
    setBarriersLeft,
  ] =
    useState({
      P1:
        START_BARRIERS,

      P2:
        START_BARRIERS,
    });

  const [
    winner,
    setWinner,
  ] =
    useState(null);

  const [
    timeLeft,
    setTimeLeft,
  ] =
    useState({
      P1: 300,
      P2: 300,
    });

  const [
    botPreviousPosition,
    setBotPreviousPosition,
  ] =
    useState(null);

  /*
  BLOCKED EDGES
  */

  const blockedEdges =
    useMemo(() => {
      return new Set(
        barriers.flatMap(
          (barrier) =>
            barrier.edges
        )
      );
    }, [barriers]);

  /*
  =========================================================
  APPLY STATE FROM ONLINE SERVER
  =========================================================
  */

  function applyGameState(
    state
  ) {
    setPositions(
      state.positions
    );

    setTurn(
      state.turn
    );

    setBarriers(
      state.barriers ||
        []
    );

    setBarriersLeft(
      state.barriersLeft
    );

    setWinner(
      state.winner
    );

    setTimeLeft(
      state.timeLeft
    );

    setSelectedHex(
      null
    );

    setActionMode(
      "MOVE"
    );

    setStarted(true);
  }

  /*
  =========================================================
  SOCKET EVENTS
  =========================================================
  */

  useEffect(() => {
    function onRoomReady(
      data
    ) {
      setPlayer1Name(
        data.players.P1.name
      );

      setPlayer2Name(
        data.players.P2.name
      );

      setStartingMinutes(
        data.minutes
      );

      setOnlineStatus(
        "Opponent connected!"
      );

      /*
      Player 1 initializes
      the game.
      */

      if (
        data.players.P1
          .socketId ===
        socket.id
      ) {
        const initial =
          createInitialGameState(
            data.minutes
          );

        socket.emit(
          "initialize-game",
          {
            roomCode:
              data.roomCode,

            state: initial,
          }
        );
      }
    }

    function onGameState(
      state
    ) {
      applyGameState(
        state
      );
    }

    function onPlayerLeft(
      data
    ) {
      setOnlineStatus(
        data.message
      );
    }

    socket.on(
      "room-ready",
      onRoomReady
    );

    socket.on(
      "game-state",
      onGameState
    );

    socket.on(
      "player-left",
      onPlayerLeft
    );

    return () => {
      socket.off(
        "room-ready",
        onRoomReady
      );

      socket.off(
        "game-state",
        onGameState
      );

      socket.off(
        "player-left",
        onPlayerLeft
      );
    };
  }, []);

  /*
  =========================================================
  LOCAL GAME START
  =========================================================
  */

  function startLocalGame() {
    const initial =
      createInitialGameState(
        startingMinutes
      );

    applyGameState(
      initial
    );

    setBotPreviousPosition(
      null
    );

    if (
      mode === "BOT"
    ) {
      setPlayer2Name(
        "HexBot"
      );
    }
  }

  /*
  =========================================================
  CREATE ONLINE ROOM
  =========================================================
  */

  function createOnlineRoom() {
    if (
      !onlineName.trim()
    ) {
      setOnlineStatus(
        "Enter your name first."
      );

      return;
    }

    socket.emit(
      "create-room",

      {
        name:
          onlineName.trim(),

        minutes:
          startingMinutes,
      },

      (response) => {
        if (
          !response.success
        ) {
          setOnlineStatus(
            "Could not create room."
          );

          return;
        }

        setRoomCode(
          response.roomCode
        );

        setOnlineRole(
          response.role
        );

        setPlayer1Name(
          onlineName.trim()
        );

        setOnlineStatus(
          "Waiting for another player..."
        );
      }
    );
  }

  /*
  =========================================================
  JOIN ONLINE ROOM
  =========================================================
  */

  function joinOnlineRoom() {
    if (
      !onlineName.trim()
    ) {
      setOnlineStatus(
        "Enter your name."
      );

      return;
    }

    if (
      !roomInput.trim()
    ) {
      setOnlineStatus(
        "Enter the room code."
      );

      return;
    }

    socket.emit(
      "join-room",

      {
        roomCode:
          roomInput
            .trim()
            .toUpperCase(),

        name:
          onlineName.trim(),
      },

      (response) => {
        if (
          !response.success
        ) {
          setOnlineStatus(
            response.message
          );

          return;
        }

        setRoomCode(
          response.roomCode
        );

        setOnlineRole(
          response.role
        );

        setOnlineStatus(
          "Joined! Starting game..."
        );
      }
    );
  }

  /*
  =========================================================
  LOCAL CLOCK

  Online clock is controlled
  entirely by the backend.
  =========================================================
  */

  useEffect(() => {
    if (
      !started ||
      winner ||
      mode ===
        "ONLINE"
    ) {
      return;
    }

    if (
      mode === "BOT" &&
      turn === "P2"
    ) {
      return;
    }

    const interval =
      setInterval(() => {
        setTimeLeft(
          (old) => {
            const newTime =
              Math.max(
                0,
                old[turn] -
                  1
              );

            if (
              newTime === 0
            ) {
              setWinner(
                turn ===
                  "P1"
                  ? "P2"
                  : "P1"
              );
            }

            return {
              ...old,

              [turn]:
                newTime,
            };
          }
        );
      }, 1000);

    return () =>
      clearInterval(
        interval
      );
  }, [
    turn,
    started,
    winner,
    mode,
  ]);

  /*
  =========================================================
  MOVEMENT
  =========================================================
  */

  function legalMoves(
    player
  ) {
    const myPosition =
      positions[player];

    const opponent =
      player === "P1"
        ? "P2"
        : "P1";

    const opponentPosition =
      positions[
        opponent
      ];

    const legal =
      new Set();

    for (
      const neighbor
      of neighborsOf(
        myPosition
      )
    ) {
      if (
        blockedEdges.has(
          edgeKey(
            myPosition,
            neighbor
          )
        )
      ) {
        continue;
      }

      if (
        neighbor !==
        opponentPosition
      ) {
        legal.add(
          neighbor
        );

        continue;
      }

      for (
        const jumpTarget
        of neighborsOf(
          opponentPosition
        )
      ) {
        if (
          jumpTarget ===
          myPosition
        ) {
          continue;
        }

        if (
          blockedEdges.has(
            edgeKey(
              opponentPosition,
              jumpTarget
            )
          )
        ) {
          continue;
        }

        if (
          jumpTarget !==
            positions.P1 &&
          jumpTarget !==
            positions.P2
        ) {
          legal.add(
            jumpTarget
          );
        }
      }
    }

    return [
      ...legal,
    ];
  }

  const currentMoves =
    legalMoves(turn);

  /*
  =========================================================
  ONLINE ACTION HELPER
  =========================================================
  */

  function sendOnlineState(
    state
  ) {
    socket.emit(
      "game-action",

      {
        roomCode,
        state,
      },

      (response) => {
        if (
          response &&
          !response.success
        ) {
          setOnlineStatus(
            response.message ||
              "Action rejected."
          );
        }
      }
    );
  }

  /*
  =========================================================
  MOVE PLAYER
  =========================================================
  */

  function movePlayer(
    cellId
  ) {
    if (winner) {
      return;
    }

    if (
      mode === "BOT" &&
      turn === "P2"
    ) {
      return;
    }

    if (
      mode ===
        "ONLINE" &&
      onlineRole !==
        turn
    ) {
      return;
    }

    if (
      actionMode !==
      "MOVE"
    ) {
      return;
    }

    if (
      !currentMoves.includes(
        cellId
      )
    ) {
      return;
    }

    const newPositions = {
      ...positions,

      [turn]:
        cellId,
    };

    let newWinner =
      null;

    if (
      turn === "P1" &&
      P1_GOALS.has(
        cellId
      )
    ) {
      newWinner =
        "P1";
    }

    if (
      turn === "P2" &&
      P2_GOALS.has(
        cellId
      )
    ) {
      newWinner =
        "P2";
    }

    const nextTurn =
      newWinner
        ? turn
        : turn === "P1"
        ? "P2"
        : "P1";

    if (
      mode ===
      "ONLINE"
    ) {
      sendOnlineState({
        positions:
          newPositions,

        turn:
          nextTurn,

        barriers,

        barriersLeft,

        winner:
          newWinner,

        timeLeft,
      });

      return;
    }

    setPositions(
      newPositions
    );

    if (
      newWinner
    ) {
      setWinner(
        newWinner
      );

      return;
    }

    setActionMode(
      "MOVE"
    );

    setSelectedHex(
      null
    );

    setTurn(
      nextTurn
    );
  }

  /*
  =========================================================
  BARRICADE VALIDATION
  =========================================================
  */

  function barrierAvailable(
    barrier,
    player = turn
  ) {
    if (!barrier) {
      return false;
    }

    if (
      barriersLeft[
        player
      ] <= 0
    ) {
      return false;
    }

    const occupied =
      new Set(
        barriers.flatMap(
          (existing) =>
            existing.edges
        )
      );

    if (
      barrier.edges.some(
        (edge) =>
          occupied.has(
            edge
          )
      )
    ) {
      return false;
    }

    const proposed =
      new Set([
        ...blockedEdges,
        ...barrier.edges,
      ]);

    const p1Path =
      shortestPathLength(
        positions.P1,
        P1_GOALS,
        proposed
      );

    const p2Path =
      shortestPathLength(
        positions.P2,
        P2_GOALS,
        proposed
      );

    return (
      p1Path !==
        Infinity &&
      p2Path !==
        Infinity
    );
  }

  function handleHexClick(
    cellId
  ) {
    if (winner) {
      return;
    }

    if (
      mode ===
        "ONLINE" &&
      onlineRole !==
        turn
    ) {
      return;
    }

    if (
      mode === "BOT" &&
      turn === "P2"
    ) {
      return;
    }

    if (
      actionMode ===
      "MOVE"
    ) {
      movePlayer(
        cellId
      );

      return;
    }

    setSelectedHex(
      cellId
    );
  }

  /*
  =========================================================
  PLACE BARRICADE
  =========================================================
  */

  function placeBarrier(
    vertexIndex
  ) {
    if (
      !selectedHex
    ) {
      return;
    }

    if (
      mode ===
        "ONLINE" &&
      onlineRole !==
        turn
    ) {
      return;
    }

    const barrier =
      createCornerBarrier(
        selectedHex,
        vertexIndex
      );

    if (
      !barrierAvailable(
        barrier
      )
    ) {
      return;
    }

    const newBarriers = [
      ...barriers,

      {
        ...barrier,
        owner: turn,
      },
    ];

    const newBarriersLeft = {
      ...barriersLeft,

      [turn]:
        barriersLeft[
          turn
        ] - 1,
    };

    const nextTurn =
      turn === "P1"
        ? "P2"
        : "P1";

    if (
      mode ===
      "ONLINE"
    ) {
      sendOnlineState({
        positions,

        turn:
          nextTurn,

        barriers:
          newBarriers,

        barriersLeft:
          newBarriersLeft,

        winner,

        timeLeft,
      });

      return;
    }

    setBarriers(
      newBarriers
    );

    setBarriersLeft(
      newBarriersLeft
    );

    setActionMode(
      "MOVE"
    );

    setSelectedHex(
      null
    );

    setTurn(
      nextTurn
    );
  }

  /*
  =========================================================
  BOT
  =========================================================
  */

  useEffect(() => {
    if (
      !started ||
      mode !== "BOT" ||
      turn !== "P2" ||
      winner
    ) {
      return;
    }

    const timer =
      setTimeout(
        async () => {
          const moves =
            legalMoves(
              "P2"
            );

          const botCurrentPath =
            shortestPathLength(
              positions.P2,
              P2_GOALS,
              blockedEdges
            );

          const humanCurrentPath =
            shortestPathLength(
              positions.P1,
              P1_GOALS,
              blockedEdges
            );

          const moveOptions =
            moves.map(
              (move) => ({
                id: move,

                botPath:
                  shortestPathLength(
                    move,
                    P2_GOALS,
                    blockedEdges
                  ),

                isGoal:
                  P2_GOALS.has(
                    move
                  ),

                isBacktrack:
                  move ===
                  botPreviousPosition,
              })
            );

          const barrierOptions =
            ALL_BARRIERS
              .filter(
                (barrier) =>
                  barrierAvailable(
                    barrier,
                    "P2"
                  )
              )

              .map(
                (barrier) => {
                  const proposed =
                    new Set([
                      ...blockedEdges,
                      ...barrier.edges,
                    ]);

                  const humanPath =
                    shortestPathLength(
                      positions.P1,
                      P1_GOALS,
                      proposed
                    );

                  const botPath =
                    shortestPathLength(
                      positions.P2,
                      P2_GOALS,
                      proposed
                    );

                  return {
                    id:
                      barrier.id,

                    humanPath,

                    botPath,

                    humanDamage:
                      humanPath -
                      humanCurrentPath,

                    botDamage:
                      botPath -
                      botCurrentPath,
                  };
                }
              );

          try {
            const response =
              await fetch(
                `${SERVER_URL}/api/bot-action`,

                {
                  method:
                    "POST",

                  headers: {
                    "Content-Type":
                      "application/json",
                  },

                  body:
                    JSON.stringify({
                      moves:
                        moveOptions,

                      barriers:
                        barrierOptions,

                      botCurrentPath,

                      humanCurrentPath,

                      barriersRemaining:
                        barriersLeft.P2,
                    }),
                }
              );

            const decision =
              await response.json();

            if (
              decision.type ===
              "BARRIER"
            ) {
              const barrier =
                ALL_BARRIERS.find(
                  (candidate) =>
                    candidate.id ===
                    decision.id
                );

              if (
                barrier &&
                barrierAvailable(
                  barrier,
                  "P2"
                )
              ) {
                setBarriers(
                  (old) => [
                    ...old,

                    {
                      ...barrier,

                      owner:
                        "P2",
                    },
                  ]
                );

                setBarriersLeft(
                  (old) => ({
                    ...old,

                    P2:
                      old.P2 -
                      1,
                  })
                );

                setTurn(
                  "P1"
                );

                return;
              }
            }

            const chosenMove =
              decision.move;

            const legalMove =
              moves.includes(
                chosenMove
              )
                ? chosenMove
                : moves[0];

            if (
              !legalMove
            ) {
              return;
            }

            setBotPreviousPosition(
              positions.P2
            );

            setPositions(
              (old) => ({
                ...old,

                P2:
                  legalMove,
              })
            );

            if (
              P2_GOALS.has(
                legalMove
              )
            ) {
              setWinner(
                "P2"
              );
            } else {
              setTurn(
                "P1"
              );
            }
          } catch (
            error
          ) {
            console.error(
              error
            );
          }
        },

        500
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    turn,
    started,
    mode,
    winner,
    barriers,
    positions,
    botPreviousPosition,
  ]);

  /*
  =========================================================
  LEAVE / NEW GAME
  =========================================================
  */

  function leaveGame() {
    if (
      mode ===
        "ONLINE" &&
      roomCode
    ) {
      socket.emit(
        "leave-room",
        {
          roomCode,
        }
      );
    }

    setStarted(false);

    setRoomCode("");

    setRoomInput("");

    setOnlineRole(
      null
    );

    setOnlineStatus(
      ""
    );

    setSelectedHex(
      null
    );
  }

  /*
  =========================================================
  SETUP SCREEN
  =========================================================
  */

  if (!started) {
    return (
      <div className="setup-screen">

        <div className="setup-card">

          <h1>
            HEXICADE
          </h1>

          <p>
            Race to the opposite side while blocking your opponent.
          </p>

          <label>
            Game Mode
          </label>

          <div className="three-mode-buttons">

            <button
              className={
                mode ===
                "BOT"
                  ? "active"
                  : ""
              }

              onClick={() => {
                setMode(
                  "BOT"
                );

                setPlayer2Name(
                  "HexBot"
                );
              }}
            >
              vs Bot
            </button>

            <button
              className={
                mode ===
                "PVP"
                  ? "active"
                  : ""
              }

              onClick={() => {
                setMode(
                  "PVP"
                );

                setPlayer2Name(
                  "Player 2"
                );
              }}
            >
              Local
            </button>

            <button
              className={
                mode ===
                "ONLINE"
                  ? "active"
                  : ""
              }

              onClick={() => {
                setMode(
                  "ONLINE"
                );
              }}
            >
              Online
            </button>

          </div>

          {/* BOT / LOCAL */}

          {mode !==
            "ONLINE" && (
            <>
              <label>
                Player 1 Name
              </label>

              <input
                value={
                  player1Name
                }

                onChange={(
                  event
                ) =>
                  setPlayer1Name(
                    event
                      .target
                      .value
                  )
                }
              />

              {mode ===
                "PVP" && (
                <>
                  <label>
                    Player 2 Name
                  </label>

                  <input
                    value={
                      player2Name
                    }

                    onChange={(
                      event
                    ) =>
                      setPlayer2Name(
                        event
                          .target
                          .value
                      )
                    }
                  />
                </>
              )}

              <label>
                Chess Clock
              </label>

              <select
                value={
                  startingMinutes
                }

                onChange={(
                  event
                ) =>
                  setStartingMinutes(
                    Number(
                      event
                        .target
                        .value
                    )
                  )
                }
              >
                <option value={3}>
                  3 minutes
                </option>

                <option value={5}>
                  5 minutes
                </option>

                <option value={10}>
                  10 minutes
                </option>

                <option value={15}>
                  15 minutes
                </option>
              </select>

              <button
                className="start-button"

                onClick={
                  startLocalGame
                }
              >
                Start Game
              </button>
            </>
          )}

          {/* ONLINE */}

          {mode ===
            "ONLINE" && (
            <div className="online-box">

              <div className="online-choice">

                <button
                  className={
                    onlineChoice ===
                    "CREATE"
                      ? "active"
                      : ""
                  }

                  onClick={() =>
                    setOnlineChoice(
                      "CREATE"
                    )
                  }
                >
                  Create Game
                </button>

                <button
                  className={
                    onlineChoice ===
                    "JOIN"
                      ? "active"
                      : ""
                  }

                  onClick={() =>
                    setOnlineChoice(
                      "JOIN"
                    )
                  }
                >
                  Join Game
                </button>

              </div>

              <label>
                Your Name
              </label>

              <input
                value={
                  onlineName
                }

                placeholder="Enter your name"

                onChange={(
                  event
                ) =>
                  setOnlineName(
                    event
                      .target
                      .value
                  )
                }
              />

              {onlineChoice ===
                "CREATE" && (
                <>
                  <label>
                    Chess Clock
                  </label>

                  <select
                    value={
                      startingMinutes
                    }

                    onChange={(
                      event
                    ) =>
                      setStartingMinutes(
                        Number(
                          event
                            .target
                            .value
                        )
                      )
                    }
                  >
                    <option value={3}>
                      3 minutes
                    </option>

                    <option value={5}>
                      5 minutes
                    </option>

                    <option value={10}>
                      10 minutes
                    </option>

                    <option value={15}>
                      15 minutes
                    </option>
                  </select>

                  {!roomCode && (
                    <button
                      className="start-button"

                      onClick={
                        createOnlineRoom
                      }
                    >
                      Create Room
                    </button>
                  )}

                  {roomCode && (
                    <div className="room-card">

                      <div>
                        Room Code
                      </div>

                      <strong>
                        {roomCode}
                      </strong>

                      <p>
                        Send this code to your friend.
                      </p>

                    </div>
                  )}
                </>
              )}

              {onlineChoice ===
                "JOIN" && (
                <>
                  <label>
                    Room Code
                  </label>

                  <input
                    value={
                      roomInput
                    }

                    placeholder="Example: A7K29Q"

                    maxLength={6}

                    onChange={(
                      event
                    ) =>
                      setRoomInput(
                        event
                          .target
                          .value
                          .toUpperCase()
                      )
                    }
                  />

                  <button
                    className="start-button"

                    onClick={
                      joinOnlineRoom
                    }
                  >
                    Join Room
                  </button>
                </>
              )}

              {onlineStatus && (
                <div className="online-status">
                  {onlineStatus}
                </div>
              )}

            </div>
          )}

        </div>

      </div>
    );
  }

  /*
  =========================================================
  GAME SCREEN
  =========================================================
  */

  const canControl =
    mode !== "ONLINE" ||
    onlineRole ===
      turn;

  return (
    <div className="app">

      <header>
        <h1>
          HEXICADE
        </h1>

        {mode ===
          "ONLINE" && (
          <div className="online-room-header">
            Room:{" "}
            <strong>
              {roomCode}
            </strong>

            {" • "}

            You are{" "}
            <strong>
              {onlineRole ===
              "P1"
                ? player1Name
                : player2Name}
            </strong>
          </div>
        )}
      </header>

      <main className="game-layout">

        {/* PLAYER 2 */}

        <aside
          className={
            turn === "P2"
              ? "player-panel active-player"
              : "player-panel"
          }
        >
          <h2>
            {mode === "BOT"
              ? "HexBot"
              : player2Name}
          </h2>

          {mode === "BOT" ? (
            <div className="bot-label">
              HEXBOT
            </div>
          ) : (
            <div className="clock">
              {formatTime(
                timeLeft.P2
              )}
            </div>
          )}

          <div>
            Barricades:{" "}
            {barriersLeft.P2}
          </div>
        </aside>

        {/* BOARD */}

        <section className="board-shell">

          <svg
            viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}

            className="board-svg"
          >

            <rect
              x="6"
              y="6"

              width={
                BOARD_WIDTH -
                12
              }

              height={
                BOARD_HEIGHT -
                12
              }

              rx="15"

              className="board-background"
            />

            {Array.from({
              length:
                COLS,
            }).flatMap(
              (
                _,
                col
              ) =>
                Array.from({
                  length:
                    ROWS,
                }).map(
                  (
                    _,
                    row
                  ) => {
                    const id =
                      idOf(
                        col,
                        row
                      );

                    const center =
                      centerOf(
                        col,
                        row
                      );

                    const legal =
                      actionMode ===
                        "MOVE" &&
                      currentMoves.includes(
                        id
                      ) &&
                      canControl;

                    const selected =
                      selectedHex ===
                      id;

                    const isGoal =
                      P1_GOALS.has(
                        id
                      ) ||
                      P2_GOALS.has(
                        id
                      );

                    return (
                      <g
                        key={
                          id
                        }

                        className={
                          selected
                            ? "hex-group selected"
                            : legal
                            ? "hex-group legal"
                            : "hex-group"
                        }

                        onClick={() =>
                          handleHexClick(
                            id
                          )
                        }
                      >

                        <polygon
                          points={hexPoints(
                            center.x,
                            center.y,
                            HEX_DRAW +
                              4
                          )}

                          className="hex-rim"
                        />

                        <polygon
                          points={hexPoints(
                            center.x,
                            center.y
                          )}

                          className="hex-cell"
                        />

                        {isGoal && (
                          <circle
                            cx={
                              center.x
                            }

                            cy={
                              center.y
                            }

                            r="3.5"

                            className="goal-marker"
                          />
                        )}

                        {legal && (
                          <circle
                            cx={
                              center.x
                            }

                            cy={
                              center.y
                            }

                            r="6"

                            className="move-dot"
                          />
                        )}

                      </g>
                    );
                  }
                )
            )}

            {/* BARRICADES */}

            {barriers.map(
              (
                barrier
              ) => (
                <polyline
                  key={
                    barrier.id
                  }

                  points={barrier.points
                    .map(
                      (
                        point
                      ) =>
                        `${point.x},${point.y}`
                    )
                    .join(
                      " "
                    )}

                  className={
                    barrier.owner ===
                    "P1"
                      ? "corner-barrier p1-barrier"
                      : "corner-barrier p2-barrier"
                  }
                />
              )
            )}

            {/* BARRICADE CORNERS */}

            {actionMode ===
              "BARRICADE" &&
              selectedHex &&
              canControl &&
              Array.from({
                length: 6,
              }).map(
                (
                  _,
                  vertex
                ) => {
                  const {
                    col,
                    row,
                  } =
                    parseId(
                      selectedHex
                    );

                  const point =
                    vertexOf(
                      col,
                      row,
                      vertex,
                      HEX_DRAW +
                        8
                    );

                  const candidate =
                    createCornerBarrier(
                      selectedHex,
                      vertex
                    );

                  const valid =
                    barrierAvailable(
                      candidate
                    );

                  return (
                    <circle
                      key={
                        vertex
                      }

                      cx={
                        point.x
                      }

                      cy={
                        point.y
                      }

                      r="10"

                      className={
                        valid
                          ? "corner-button"
                          : "corner-button invalid"
                      }

                      onClick={(
                        event
                      ) => {
                        event.stopPropagation();

                        if (
                          valid
                        ) {
                          placeBarrier(
                            vertex
                          );
                        }
                      }}
                    />
                  );
                }
              )}

            {/* PLAYERS */}

            {Object.entries(
              positions
            ).map(
              ([
                player,
                id,
              ]) => {
                const {
                  col,
                  row,
                } =
                  parseId(
                    id
                  );

                const center =
                  centerOf(
                    col,
                    row
                  );

                return (
                  <g
                    key={
                      player
                    }
                  >
                    <circle
                      cx={
                        center.x
                      }

                      cy={
                        center.y
                      }

                      r="22"

                      className={
                        player ===
                        "P1"
                          ? "player player-one"
                          : "player player-two"
                      }
                    />

                    <text
                      x={
                        center.x
                      }

                      y={
                        center.y +
                        6
                      }

                      textAnchor="middle"

                      className="player-text"
                    >
                      {player ===
                      "P1"
                        ? "1"
                        : "2"}
                    </text>
                  </g>
                );
              }
            )}

          </svg>

        </section>

        {/* PLAYER 1 */}

        <aside
          className={
            turn === "P1"
              ? "player-panel active-player"
              : "player-panel"
          }
        >

          <h2>
            {player1Name}
          </h2>

          <div className="clock">
            {formatTime(
              timeLeft.P1
            )}
          </div>

          <div>
            Barricades:{" "}
            {barriersLeft.P1}
          </div>

          {!winner &&
            canControl &&
            !(
              mode ===
                "BOT" &&
              turn ===
                "P2"
            ) && (
              <div className="action-buttons">

                <button
                  className={
                    actionMode ===
                    "MOVE"
                      ? "active-action"
                      : ""
                  }

                  onClick={() => {
                    setActionMode(
                      "MOVE"
                    );

                    setSelectedHex(
                      null
                    );
                  }}
                >
                  Move
                </button>

                <button
                  className={
                    actionMode ===
                    "BARRICADE"
                      ? "active-action"
                      : ""
                  }

                  onClick={() => {
                    setActionMode(
                      "BARRICADE"
                    );

                    setSelectedHex(
                      null
                    );
                  }}
                >
                  Barricade
                </button>

              </div>
            )}

          {mode ===
            "ONLINE" &&
            !canControl &&
            !winner && (
              <p className="waiting-turn">
                Waiting for opponent...
              </p>
            )}

          {actionMode ===
            "BARRICADE" &&
            !selectedHex &&
            canControl && (
              <p className="help">
                Click a hexagon, then choose one of its 6 corners.
              </p>
            )}

          {winner && (
            <div className="winner">
              {winner ===
              "P1"
                ? player1Name
                : mode ===
                  "BOT"
                ? "HexBot"
                : player2Name}{" "}
              wins!
            </div>
          )}

          {onlineStatus &&
            mode ===
              "ONLINE" && (
              <div className="small-online-status">
                {onlineStatus}
              </div>
            )}

          <button
            className="restart"

            onClick={
              leaveGame
            }
          >
            New Game
          </button>

        </aside>

      </main>

    </div>
  );
}

export default App;