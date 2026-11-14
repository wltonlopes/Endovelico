"""
Gera as texturas e malhas da iluminação falsa do fogo (art/.../fire_light).
O motor não tem luzes dinâmicas: a luz é imitada por um brilho aditivo
(partículas) e, nas fogueiras, por uma "poça" de luz emissiva no chão.
Rodar da raiz do mod: python3 tools/fire_light_assets.py
"""
import numpy as np
from PIL import Image

# Brilho das partículas: gradiente radial branco suave (a cor vem da partícula).
n = 128
y, x = np.mgrid[0:n, 0:n]
r = np.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / (n / 2)
g = np.clip(1 - r, 0, 1) ** 2.2
a = (g * 255).astype(np.uint8)
Image.fromarray(np.dstack([a, a, a, a]), 'RGBA').save('art/textures/particles/fire_glow.png')

# Poça de luz no chão: laranja quente, alfa caindo para as bordas.
n = 256
y, x = np.mgrid[0:n, 0:n]
r = np.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / (n / 2)
f = np.clip(1 - r, 0, 1)
alpha = (f ** 1.6 * 0.55 * 255).astype(np.uint8)
col = np.zeros((n, n, 3), np.uint8)
col[..., 0] = 255
col[..., 1] = (150 + 70 * f).astype(np.uint8)
col[..., 2] = (60 + 60 * f ** 2).astype(np.uint8)
Image.fromarray(np.dstack([col, alpha]), 'RGBA').save('art/textures/skins/props/fire_light/light_pool.png')

# Especular preto com alfa 0 => 100% emissivo (não escurece à noite nem na sombra).
Image.fromarray(np.zeros((4, 4, 4), np.uint8), 'RGBA').save('art/textures/skins/props/fire_light/emissive_spec.png')
# Totalmente transparente (suporte invisível dos efeitos).
Image.fromarray(np.zeros((4, 4, 4), np.uint8), 'RGBA').save('art/textures/skins/props/fire_light/invisible.png')


def quad(path, half, z, name):
	s = f"""<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_geometries>
    <geometry id="{name}-mesh" name="{name}">
      <mesh>
        <source id="{name}-pos">
          <float_array id="{name}-pos-array" count="12">{-half} {-half} {z} {-half} {half} {z} {half} {-half} {z} {half} {half} {z}</float_array>
          <technique_common>
            <accessor source="#{name}-pos-array" count="4" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{name}-nrm">
          <float_array id="{name}-nrm-array" count="3">0 0 1</float_array>
          <technique_common>
            <accessor source="#{name}-nrm-array" count="1" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{name}-uv">
          <float_array id="{name}-uv-array" count="8">0 0 0 1 1 0 1 1</float_array>
          <technique_common>
            <accessor source="#{name}-uv-array" count="4" stride="2">
              <param name="S" type="float"/><param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="{name}-vtx">
          <input semantic="POSITION" source="#{name}-pos"/>
        </vertices>
        <triangles count="2">
          <input semantic="VERTEX" source="#{name}-vtx" offset="0"/>
          <input semantic="NORMAL" source="#{name}-nrm" offset="1"/>
          <input semantic="TEXCOORD" source="#{name}-uv" offset="2" set="1"/>
          <p>0 0 0 2 0 2 1 0 1 1 0 1 2 0 2 3 0 3</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="{name}" name="{name}" type="NODE">
        <matrix sid="transform">1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</matrix>
        <instance_geometry url="#{name}-mesh" name="{name}"/>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>
"""
	open(path, 'w').write(s)


quad('art/meshes/props/fire_light/anchor.dae', 0.01, 0, 'anchor')
for name, half in [('small', 3), ('medium', 5), ('large', 8)]:
	quad(f'art/meshes/props/fire_light/pool_{name}.dae', half, 0.15, 'pool_' + name)
print('ok')
