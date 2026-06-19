import bpy
import os

# Caminho para salvar os arquivos .dae
export_path = "./"

# Certifique-se de criar o diretório se ele não existir
if not os.path.exists(export_path):
    os.makedirs(export_path)

# Desativar todos os objetos
for obj in bpy.data.objects:
    obj.select_set(False)

# Exportar cada objeto individualmente
for obj in bpy.data.objects:
    if obj.type == 'MESH':  # Verifique se é um objeto de malha
        obj.select_set(True)

        # Caminho completo para o arquivo .dae
        obj_export_path = os.path.join(export_path, f"{obj.name}.dae")

        # Exportar o objeto selecionado
        bpy.ops.wm.collada_export(filepath=obj_export_path, selected=True)

        # Desselecionar o objeto após a exportação
        obj.select_set(False)

print("Exportação concluída.")

